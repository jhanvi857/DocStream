package collab

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"docstream/internal/document"
	"docstream/internal/ws"

	"github.com/google/uuid"
	"nhooyr.io/websocket"
)

const (
	writeWait  = 5 * time.Second
	pingPeriod = 30 * time.Second
)

// Client represents a connected user session on a specific document.
type Client struct {
	id     string
	userID string
	docID  string
	conn   *websocket.Conn
	send   chan ws.Message
	hub    *Hub
	role   document.Role
}

func NewClient(userID, docID string, role document.Role, conn *websocket.Conn, hub *Hub) *Client {
	return &Client{
		id:     uuid.New().String(),
		userID: userID,
		docID:  docID,
		conn:   conn,
		send:   make(chan ws.Message, 256),
		hub:    hub,
		role:   role,
	}
}

// read incoming messages from the WebSocket connection and push them to the Hub.
func (c *Client) ReadPump(ctx context.Context) {
	defer func() {
		c.hub.unregister <- c
		_ = c.conn.Close(websocket.StatusGoingAway, "client disconnected")
	}()

	// Apply read limit like 1 MB max payload.
	c.conn.SetReadLimit(1024 * 1024)

	for {
		select {
		case <-ctx.Done():
			return
		default:
			_, payload, err := c.conn.Read(ctx)
			if err != nil {
				if websocket.CloseStatus(err) == websocket.StatusNormalClosure ||
					websocket.CloseStatus(err) == websocket.StatusGoingAway {
					slog.Debug("websocket connection closed normally", "userID", c.userID, "docID", c.docID)
				} else {
					slog.Error("websocket read error", "error", err, "userID", c.userID, "docID", c.docID)
				}
				return
			}

			var msg ws.Message
			if err := json.Unmarshal(payload, &msg); err != nil {
				slog.Error("websocket JSON unmarshal error", "error", err, "userID", c.userID)
				continue
			}

			// Validate document ID in message matches client path
			if msg.DocID != c.docID {
				slog.Warn("document ID mismatch in message", "clientDocID", c.docID, "msgDocID", msg.DocID)
				continue
			}

			// Dispatch message to hub
			c.hub.operation <- hubMessage{
				client:  c,
				message: msg,
				ctx:     ctx,
			}
		}
	}
}

// WritePump writes outgoing messages from the send channel to the client.
func (c *Client) WritePump(ctx context.Context) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close(websocket.StatusGoingAway, "closing connection")
	}()

	for {
		select {
		case <-ctx.Done():
			return

		case msg, ok := <-c.send:
			if !ok {
				_ = c.conn.Write(ctx, websocket.MessageText, []byte(`{"type":"error","payload":"channel closed"}`))
				return
			}

			payload, err := json.Marshal(msg)
			if err != nil {
				slog.Error("failed to marshal message to client", "error", err)
				continue
			}

			writeCtx, cancel := context.WithTimeout(ctx, writeWait)
			err = c.conn.Write(writeCtx, websocket.MessageText, payload)
			cancel()
			if err != nil {
				slog.Error("websocket write error", "error", err, "userID", c.userID)
				return
			}

		case <-ticker.C:
			writeCtx, cancel := context.WithTimeout(ctx, writeWait)
			err := c.conn.Ping(writeCtx)
			cancel()
			if err != nil {
				slog.Error("websocket ping error", "error", err, "userID", c.userID)
				return
			}
		}
	}
}
