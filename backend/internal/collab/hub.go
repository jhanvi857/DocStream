package collab

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync"

	"docstream/internal/crdt"
	"docstream/internal/document"
	"docstream/internal/version"
	"docstream/internal/ws"

	"nhooyr.io/websocket"
)

// bind a Client source with its raw ws.Message envelope.
type hubMessage struct {
	client  *Client
	message ws.Message
	ctx     context.Context
}

// manage active document sessions and routes real-time communications.
type Hub struct {
	sessions   map[string]*Session
	register   chan *Client
	unregister chan *Client
	operation  chan hubMessage
	mu         sync.RWMutex
	vService   version.Service
	pubSub     *RedisPubSub
}

// initialize websocket Hub with required dependencies.
func NewHub(vService version.Service, pubSub *RedisPubSub) *Hub {
	return &Hub{
		sessions:   make(map[string]*Session),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		operation:  make(chan hubMessage),
		vService:   vService,
		pubSub:     pubSub,
	}
}

// start the central Hub event loop.
func (h *Hub) Run() {
	slog.Info("websocket hub running")
	for {
		select {
		case client := <-h.register:
			// Ensure session is created synchronously in the main loop to avoid race conditions
			session := h.GetOrCreateSession(client.docID)
			session.Join(client)

		case client := <-h.unregister:
			h.mu.Lock()
			if session, ok := h.sessions[client.docID]; ok {
				session.Leave(client)
				// Clean up empty sessions and terminate Redis subscription to free memory
				if session.IsEmpty() {
					session.Close()
					delete(h.sessions, client.docID)
					close(session.opsChan)
					slog.Info("session closed (no active clients)", "docID", client.docID)
				}
			}
			h.mu.Unlock()

		case hm := <-h.operation:
			h.mu.RLock()
			session, ok := h.sessions[hm.client.docID]
			h.mu.RUnlock()
			if ok {
				select {
				case session.opsChan <- hm:
				default:
					slog.Warn("session ops channel full; dropping message", "docID", session.docID)
				}
			} else {
				slog.Warn("operation discarded for non-existent session", "docID", hm.client.docID)
			}
		}
	}
}

// handleSessionMessage processes a message sequentially for a specific session worker.
func (h *Hub) handleSessionMessage(session *Session, hm hubMessage) {
	switch hm.message.Type {
	case ws.MsgTypeOp:
		var op crdt.Op
		if err := json.Unmarshal(hm.message.Payload, &op); err != nil {
			slog.Error("failed to unmarshal op payload", "error", err)
			return
		}

		if hm.client.role != document.RoleEditor && hm.client.role != document.RoleOwner {
			slog.Warn("discarding operation from read-only client", "userID", hm.client.userID, "docID", session.docID, "role", hm.client.role)
			return
		}

		if err := session.ApplyOp(hm.ctx, op, hm.client); err != nil {
			slog.Error("failed to apply CRDT operation, disconnecting client", "error", err, "docID", session.docID)
			_ = hm.client.conn.Close(websocket.StatusPolicyViolation, "crdt synchronization desync")
		}

	case ws.MsgTypeCursor:
		var payload ws.CursorPayload
		if err := json.Unmarshal(hm.message.Payload, &payload); err != nil {
			slog.Error("failed to unmarshal cursor payload", "error", err)
			return
		}
		session.HandleCursor(hm.ctx, hm.client, payload.Position)

	case ws.MsgTypeSync:
		var payload ws.SyncPayload
		if err := json.Unmarshal(hm.message.Payload, &payload); err != nil {
			slog.Error("failed to unmarshal sync payload", "error", err)
			return
		}
		session.HandleSync(hm.ctx, hm.client, payload.LastSeenClock)
	}
}

// retrieve an active session or instantiate a new one.
// If created, it spawns a goroutine to load document history asynchronously.
func (h *Hub) GetOrCreateSession(docID string) *Session {
	h.mu.Lock()
	defer h.mu.Unlock()

	session, ok := h.sessions[docID]
	if !ok {
		session = NewSession(docID, h.vService)
		h.sessions[docID] = session
		slog.Info("session created", "docID", docID)

		// Start sequential worker goroutine for the session
		session.StartWorker(h)

		// Hydrate session state from Postgres database asynchronously
		go func() {
			if err := session.LoadState(context.Background()); err != nil {
				slog.Error("failed to load session state", "error", err, "docID", docID)
			}
			// Start Redis subscription for real-time cluster sync
			if h.pubSub != nil {
				session.StartSubscriber(context.Background(), h.pubSub)
			}
			close(session.loadedChan) // Signal registration and operation routines to unblock
		}()
	}
	return session
}

// GetActiveSession returns a session if it is currently active, or nil.
func (h *Hub) GetActiveSession(docID string) *Session {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.sessions[docID]
}
