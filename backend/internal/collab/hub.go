package collab

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"docstream/internal/version"
	"docstream/internal/ws"
)

// bind a Client source with its raw ws.Message envelope.
type hubMessage struct {
	client  *Client
	message ws.Message
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
			// Process registration in background to avoid blocking other connections
			go h.handleRegister(client)

		case client := <-h.unregister:
			h.mu.Lock()
			if session, ok := h.sessions[client.docID]; ok {
				session.Leave(client)
				// Clean up empty sessions and terminate Redis subscription to free memory
				if len(session.clients) == 0 {
					if session.cancelSub != nil {
						session.cancelSub()
					}
					delete(h.sessions, client.docID)
					slog.Info("session closed (no active clients)", "docID", client.docID)
				}
			}
			h.mu.Unlock()

		case hm := <-h.operation:
			// Process message asynchronously
			go h.handleOperation(hm)
		}
	}
}

func (h *Hub) handleRegister(client *Client) {
	session := h.GetOrCreateSession(client.docID)
	// Block until the database loader finishes loading snapshot and ops
	<-session.loadedChan
	session.Join(client)
}

func (h *Hub) handleOperation(hm hubMessage) {
	h.mu.RLock()
	session, ok := h.sessions[hm.client.docID]
	h.mu.RUnlock()

	if !ok {
		slog.Warn("operation discarded for non-existent session", "docID", hm.client.docID)
		return
	}

	// Wait for DB state loading to complete before processing incoming operations
	<-session.loadedChan

	switch hm.message.Type {
	case ws.MsgTypeOp:
		var op Op
		if err := json.Unmarshal(hm.message.Payload, &op); err != nil {
			slog.Error("failed to unmarshal op payload", "error", err)
			return
		}

		if op.CreatedAt.IsZero() {
			op.CreatedAt = time.Now()
		}

		if err := session.ApplyOp(context.Background(), op, hm.client); err != nil {
			slog.Error("failed to apply CRDT operation", "error", err, "docID", session.docID)
		}

	case ws.MsgTypeCursor:
		var payload ws.CursorPayload
		if err := json.Unmarshal(hm.message.Payload, &payload); err != nil {
			slog.Error("failed to unmarshal cursor payload", "error", err)
			return
		}
		session.HandleCursor(hm.client, payload.Position)

	case ws.MsgTypeSync:
		var payload ws.SyncPayload
		if err := json.Unmarshal(hm.message.Payload, &payload); err != nil {
			slog.Error("failed to unmarshal sync payload", "error", err)
			return
		}
		session.HandleSync(context.Background(), hm.client, payload.LastSeenClock)
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
