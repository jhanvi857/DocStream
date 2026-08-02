package ws

import (
	"encoding/json"
)

type MessageType string

const (
	MsgTypeOp           MessageType = "op"
	MsgTypeCursor       MessageType = "cursor"
	MsgTypePresence     MessageType = "presence"
	MsgTypeSync         MessageType = "sync"
	MsgTypeSyncComplete MessageType = "sync_complete"
	MsgTypeAck          MessageType = "ack"
	MsgTypeError        MessageType = "error"
	MsgTypeAuth         MessageType = "auth"
)

// Message is the standard communication packet sent between Client and Server.
type Message struct {
	Type    MessageType     `json:"type"`
	DocID   string          `json:"doc_id"`
	Payload json.RawMessage `json:"payload"`
}

// tracking the index position of a specific user.
type CursorPayload struct {
	Position int    `json:"position"`
	UserID   string `json:"user_id"`
	UserName string `json:"user_name"`
	Color    string `json:"color"`
}

// broadcasts real-time join or leave status changes of session members.
type PresencePayload struct {
	UserID   string `json:"user_id"`
	UserName string `json:"user_name"`
	Color    string `json:"color"`
	Action   string `json:"action"`
}

// contain the client's last observed operational offset.
type SyncPayload struct {
	LastSeenClock int `json:"lastSeenClock"`
}

// signal the completion of sync updates with the server's current offset.
type SyncCompletePayload struct {
	ServerClock int    `json:"serverClock"`
	UserID      string `json:"user_id,omitempty"`
}

// payload sent when authenticating post-handshake over WebSocket.
type AuthPayload struct {
	Token string `json:"token"`
}
