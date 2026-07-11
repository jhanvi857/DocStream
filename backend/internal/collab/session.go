package collab

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"docstream/internal/crdt"
	"docstream/internal/version"
	"docstream/internal/ws"
	"docstream/pkg/trie"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

// coordinate real-time sync and presence for a single active document.
type Session struct {
	docID           string
	clients         map[*Client]bool
	crdtDoc         *crdt.CRDTDoc
	mu              sync.RWMutex
	vService        version.Service
	snapshotVersion int
	loadedChan      chan struct{}
	pubSub          *RedisPubSub
	cancelSub       context.CancelFunc
	opsChan         chan hubMessage

	// Presence + Cursor tracking (in-memory only)
	cursors map[string]int // client.id -> cursor index

	// Words trie for local text autocomplete suggestions (Copilot-like)
	dirty     bool
	wordsTrie *trie.Trie
}

// document Session with its dependencies.
func NewSession(docID string, vService version.Service) *Session {
	return &Session{
		docID:           docID,
		clients:         make(map[*Client]bool),
		crdtDoc:         crdt.NewCRDTDoc(),
		vService:        vService,
		snapshotVersion: 0,
		loadedChan:      make(chan struct{}),
		cursors:         make(map[string]int),
		opsChan:         make(chan hubMessage, 1000),
		dirty:           true,
		wordsTrie:       trie.NewTrie(10000),
	}
}

// StartWorker spins up the worker goroutine to process operations sequentially.
func (s *Session) StartWorker(h *Hub) {
	go func() {
		<-s.loadedChan
		for hm := range s.opsChan {
			h.handleSessionMessage(s, hm)
		}
	}()
}

// subscribe to the Redis pub/sub channel for this document.
func (s *Session) StartSubscriber(ctx context.Context, rps *RedisPubSub) {
	s.mu.Lock()
	s.pubSub = rps
	// Store cancel function to tear down subscription later
	subCtx, cancel := context.WithCancel(ctx)
	s.cancelSub = cancel
	s.mu.Unlock()

	channel := fmt.Sprintf("doc:%s", s.docID)
	pubsub := rps.client.Subscribe(subCtx, channel)

	go func() {
		defer pubsub.Close()
		ch := pubsub.Channel()
		slog.Info("redis pubsub subscriber loop started", "docID", s.docID)

		for {
			select {
			case <-subCtx.Done():
				slog.Info("redis pubsub subscriber context cancelled; exiting loop", "docID", s.docID)
				return
			case msg, ok := <-ch:
				if !ok {
					slog.Info("redis pubsub channel closed; exiting loop", "docID", s.docID)
					return
				}

				var rmsg RedisMessage
				if err := json.Unmarshal([]byte(msg.Payload), &rmsg); err != nil {
					slog.Error("failed to unmarshal redis message", "error", err, "docID", s.docID)
					continue
				}
				if rmsg.SenderInstanceID == rps.instanceID {
					continue
				}

				// Apply operations received from other server instances
				if err := s.ApplyRemoteOp(subCtx, rmsg.Op); err != nil {
					slog.Error("failed to apply remote operation", "error", err, "docID", s.docID)
				}
			}
		}
	}()
}

// retrieve the document snapshot from Postgres and replay newer operations.
func (s *Session) LoadState(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	content, ops, versionNum, err := s.vService.LoadDocumentState(ctx, s.docID)
	if err != nil {
		return err
	}

	// 1. Initialize CRDT sequence from snapshot bytes
	doc, err := crdt.FromJSON(content)
	if err != nil {
		return err
	}
	s.crdtDoc = doc
	s.snapshotVersion = versionNum

	// 2. Replay all incremental logs on top of the snapshot
	for _, op := range ops {
		collabOp := crdt.Op{
			ID:        op.ID,
			DocID:     op.DocID,
			UserID:    op.UserID,
			OpType:    op.OpType,
			CharID:    op.CharID,
			Char:      op.Char,
			AfterID:   op.AfterID,
			IsDeleted: op.IsDeleted,
			CreatedAt: op.CreatedAt,
		}

		if len(op.VectorClock) > 0 && string(op.VectorClock) != "null" {
			_ = json.Unmarshal(op.VectorClock, &collabOp.VectorClock)
		}

		if err := s.crdtDoc.Apply(collabOp); err != nil {
			slog.Error("failed to replay operation during session load", "error", err, "docID", s.docID)
		}
	}

	slog.Info("session state loaded successfully", "docID", s.docID, "snapshotVersion", s.snapshotVersion, "replayedOps", len(ops))
	return nil
}

// register a client to the session and broadcast a join presence event.
func (s *Session) Join(client *Client) {
	s.mu.Lock()
	s.clients[client] = true
	s.cursors[client.id] = 0 // Initialize cursor position
	slog.Info("client joined session", "userID", client.userID, "docID", s.docID)

	// Send presence of all existing clients to the joining client
	for existingClient := range s.clients {
		if existingClient.userID != client.userID {
			color := GetDeterministicColor(existingClient.userID)
			payload, _ := json.Marshal(ws.PresencePayload{
				UserID:   existingClient.userID,
				UserName: existingClient.userID,
				Color:    color,
				Action:   "join",
			})
			client.send <- ws.Message{
				Type:    ws.MsgTypePresence,
				DocID:   s.docID,
				Payload: payload,
			}
		}
	}
	s.mu.Unlock()

	// Broadcast Join Presence
	color := GetDeterministicColor(client.userID)
	payload, _ := json.Marshal(ws.PresencePayload{
		UserID:   client.userID,
		UserName: client.userID,
		Color:    color,
		Action:   "join",
	})

	s.Broadcast(ws.Message{
		Type:    ws.MsgTypePresence,
		DocID:   s.docID,
		Payload: payload,
	}, client)
}

// removes a client, purges in-memory cursor, and broadcasts a leave presence event.
func (s *Session) Leave(client *Client) {
	s.mu.Lock()
	if _, ok := s.clients[client]; ok {
		delete(s.clients, client)
		delete(s.cursors, client.id)
		close(client.send)
		slog.Info("client left session", "userID", client.userID, "docID", s.docID)
	}
	s.mu.Unlock()

	// Broadcast Leave Presence
	color := GetDeterministicColor(client.userID)
	payload, _ := json.Marshal(ws.PresencePayload{
		UserID:   client.userID,
		UserName: client.userID,
		Color:    color,
		Action:   "leave",
	})

	s.Broadcast(ws.Message{
		Type:    ws.MsgTypePresence,
		DocID:   s.docID,
		Payload: payload,
	}, client)
}

// update a client's cursor position and broadcasts it to session peers.
func (s *Session) HandleCursor(ctx context.Context, client *Client, position int) {
	ctx, span := otel.Tracer("session").Start(ctx, "session.HandleCursor",
		trace.WithAttributes(
			attribute.String("userID", client.userID),
			attribute.Int("position", position),
		),
	)
	defer span.End()

	s.mu.Lock()
	s.cursors[client.id] = position
	s.mu.Unlock()

	color := GetDeterministicColor(client.userID)
	payload, _ := json.Marshal(ws.CursorPayload{
		Position: position,
		UserID:   client.userID,
		UserName: client.userID,
		Color:    color,
	})

	s.Broadcast(ws.Message{
		Type:    ws.MsgTypeCursor,
		DocID:   s.docID,
		Payload: payload,
	}, client)
}

// execute the synchronization protocol for connecting and reconnecting clients.
func (s *Session) HandleSync(ctx context.Context, client *Client, lastSeenClock int) {
	ctx, span := otel.Tracer("session").Start(ctx, "session.HandleSync",
		trace.WithAttributes(
			attribute.String("userID", client.userID),
			attribute.Int("lastSeenClock", lastSeenClock),
		),
	)
	defer span.End()

	s.mu.Lock()
	defer s.mu.Unlock()

	// 1. Retrieve total operation count for this document
	totalOps, err := s.vService.GetTotalOpsCount(ctx, s.docID)
	if err != nil {
		slog.Error("failed to retrieve operations count during sync", "error", err, "docID", s.docID)
		s.sendSyncError(client, "failed to process document sync")
		return
	}

	if lastSeenClock == 0 {
		// Fresh Connection: Send the entire document structure means sequence of nodes + tombstones
		charsBytes, err := s.crdtDoc.ToJSON()
		if err != nil {
			slog.Error("failed to serialize CRDT state for sync", "error", err, "docID", s.docID)
			s.sendSyncError(client, "failed to process document state")
			return
		}

		client.send <- ws.Message{
			Type:    ws.MsgTypeSync,
			DocID:   s.docID,
			Payload: charsBytes,
		}
	} else {
		// Reconnect: Query and push only operations logged after the client's offset
		ops, err := s.vService.GetOpsAfter(ctx, s.docID, lastSeenClock)
		if err != nil {
			slog.Error("failed to query operations drift for sync", "error", err, "offset", lastSeenClock, "docID", s.docID)
			s.sendSyncError(client, "failed to process operations sync")
			return
		}

		for _, op := range ops {
		collabOp := crdt.Op{
				ID:        op.ID,
				DocID:     op.DocID,
				UserID:    op.UserID,
				OpType:    op.OpType,
				CharID:    op.CharID,
				Char:      op.Char,
				AfterID:   op.AfterID,
				IsDeleted: op.IsDeleted,
				CreatedAt: op.CreatedAt,
			}
			if len(op.VectorClock) > 0 && string(op.VectorClock) != "null" {
				_ = json.Unmarshal(op.VectorClock, &collabOp.VectorClock)
			}

			payload, _ := json.Marshal(collabOp)
			client.send <- ws.Message{
				Type:    ws.MsgTypeOp,
				DocID:   s.docID,
				Payload: payload,
			}
		}
	}

	// 2. Transmit sync completion marker with server sequence version
	completePayload, _ := json.Marshal(ws.SyncCompletePayload{
		ServerClock: totalOps,
		UserID:      client.userID,
	})
	client.send <- ws.Message{
		Type:    ws.MsgTypeSyncComplete,
		DocID:   s.docID,
		Payload: completePayload,
	}
}

func (s *Session) sendSyncError(client *Client, msg string) {
	payload, _ := json.Marshal(map[string]string{"error": msg})
	client.send <- ws.Message{
		Type:    ws.MsgTypeError,
		DocID:   s.docID,
		Payload: payload,
	}
}

// distribute a message to all clients in the session, optionally skipping a target client.
func (s *Session) Broadcast(msg ws.Message, excludeClient *Client) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for client := range s.clients {
		if excludeClient != nil && client.id == excludeClient.id {
			continue
		}
		select {
		case client.send <- msg:
		default:
			slog.Warn("client send channel full; dropping message", "userID", client.userID, "docID", s.docID)
		}
	}
}

// update the document CRDT structure, persists the change, publishes to Redis Pub/Sub, and broadcasts.
func (s *Session) ApplyOp(ctx context.Context, op crdt.Op, excludeClient *Client) error {
	ctx, span := otel.Tracer("session").Start(ctx, "session.ApplyOp",
		trace.WithAttributes(
			attribute.String("userID", op.UserID),
			attribute.String("opType", op.OpType),
			attribute.String("charID", op.CharID),
		),
	)
	defer span.End()

	s.mu.Lock()
	defer s.mu.Unlock()

	// Always override with server-side time to eliminate client clock-drift / timezone bugs
	// Doing this under the lock ensures strict monotonic ordering and prevents a gap between
	// the snapshot timestamp and subsequent queued operation timestamps.
	op.CreatedAt = time.Now()

	// 1. Apply operational changes locally
	if err := s.crdtDoc.Apply(op); err != nil {
		span.RecordError(err)
		return err
	}
	s.dirty = true

	// 2. Persist the operation to PostgreSQL
	vcJSON, _ := json.Marshal(op.VectorClock)
	dbOp := &version.Op{
		ID:          op.ID,
		DocID:       op.DocID,
		UserID:      op.UserID,
		OpType:      op.OpType,
		CharID:      op.CharID,
		Char:        op.Char,
		AfterID:     op.AfterID,
		IsDeleted:   op.IsDeleted,
		VectorClock: vcJSON,
		CreatedAt:   op.CreatedAt,
	}

	shouldSnapshot, err := s.vService.PersistOp(ctx, dbOp)
	if err != nil {
		span.RecordError(err)
		slog.Error("failed to persist operation in DB", "error", err, "docID", s.docID)
	}

	// 3. Publish operation to Redis Pub/Sub channel for multi-instance fan-out
	if s.pubSub != nil {
		go func() {
			pubCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			defer cancel()
			if err := s.pubSub.PublishOp(pubCtx, s.docID, op); err != nil {
				slog.Error("failed to publish operation to Redis Pub/Sub", "error", err, "docID", s.docID)
			}
		}()
	}

	// 4. Take a snapshot every 100 operations to optimize replay load times
	if shouldSnapshot {
		slog.Info("triggering document snapshotting", "docID", s.docID)
		snapshotBytes, err := s.crdtDoc.ToJSON()
		if err == nil {
			nextVersion := s.snapshotVersion + 1
			err = s.vService.SaveSnapshot(ctx, s.docID, snapshotBytes, nextVersion)
			if err != nil {
				slog.Error("failed to save snapshot in DB", "error", err, "docID", s.docID)
			} else {
				s.snapshotVersion = nextVersion
				slog.Info("document snapshot saved", "docID", s.docID, "version", nextVersion)
			}
		} else {
			slog.Error("failed to serialize CRDT state for snapshotting", "error", err, "docID", s.docID)
		}
	}

	// 5. Format operation message for fan-out
	payload, err := json.Marshal(op)
	if err != nil {
		return err
	}

	msg := ws.Message{
		Type:    ws.MsgTypeOp,
		DocID:   s.docID,
		Payload: payload,
	}

	// 6. Broadcast to sibling connections
	for client := range s.clients {
		if excludeClient != nil && client.id == excludeClient.id {
			continue
		}
		select {
		case client.send <- msg:
		default:
			slog.Warn("client send channel full during op broadcast; dropping", "userID", client.userID)
		}
	}

	return nil
}

// apply an operation from Redis that is already persisted and broadcast to all local clients.
func (s *Session) ApplyRemoteOp(ctx context.Context, op crdt.Op) error {
	ctx, span := otel.Tracer("session").Start(ctx, "session.ApplyRemoteOp",
		trace.WithAttributes(
			attribute.String("userID", op.UserID),
			attribute.String("opType", op.OpType),
			attribute.String("charID", op.CharID),
		),
	)
	defer span.End()

	s.mu.Lock()
	defer s.mu.Unlock()

	// 1. Apply CRDT changes locally in memory
	if err := s.crdtDoc.Apply(op); err != nil {
		span.RecordError(err)
		return err
	}
	s.dirty = true

	// 2. Format operation message for fan-out
	payload, err := json.Marshal(op)
	if err != nil {
		span.RecordError(err)
		return err
	}

	msg := ws.Message{
		Type:    ws.MsgTypeOp,
		DocID:   s.docID,
		Payload: payload,
	}

	// 3. Broadcast to all clients connected to this instance (no exclusion)
	for client := range s.clients {
		select {
		case client.send <- msg:
		default:
			slog.Warn("client send channel full during remote op broadcast; dropping", "userID", client.userID)
		}
	}

	return nil
}

// map a userID string deterministically to a hexadecimal color.
func GetDeterministicColor(userID string) string {
	var hash uint32 = 5381
	for i := 0; i < len(userID); i++ {
		hash = ((hash << 5) + hash) + uint32(userID[i])
	}
	colors := []string{
		"#E02424", // Red
		"#3F83F8", // Blue
		"#0E9F6E", // Green
		"#D03801", // Orange
		"#7E3AF2", // Purple
		"#ECE513", // Yellow
		"#06B6D4", // Cyan
		"#EC4899", // Pink
	}
	return colors[hash%uint32(len(colors))]
}

// SuggestWords returns prefix-matched suggestions from the document's active text content.
func (s *Session) SuggestWords(prefix string, limit int) []trie.Suggestion {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.dirty {
		// Rebuild the words trie from the current document text content
		s.wordsTrie = trie.NewTrie(10000) // max budget of 10,000 words
		text := s.crdtDoc.ToText()
		words := extractWords(text)
		for _, w := range words {
			s.wordsTrie.Insert(w)
		}
		s.dirty = false
	}

	return s.wordsTrie.Suggest(prefix, limit)
}

func extractWords(text string) []string {
	var words []string
	var current []rune
	for _, r := range text {
		// A word consists of letters, digits, and underscores
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' {
			current = append(current, r)
		} else {
			if len(current) >= 2 {
				words = append(words, string(current))
			}
			current = current[:0]
		}
	}
	if len(current) >= 2 {
		words = append(words, string(current))
	}
	return words
}

// IsEmpty returns true if there are no clients currently in the session.
func (s *Session) IsEmpty() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.clients) == 0
}

// Close safely cancels the Redis subscriber context if active.
func (s *Session) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancelSub != nil {
		s.cancelSub()
		s.cancelSub = nil
	}
}
