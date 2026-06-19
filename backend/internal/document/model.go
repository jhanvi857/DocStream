package document

import (
	"encoding/json"
	"time"
)

// Document represents a collaborative document database record.
type Document struct {
	ID                   string          `json:"id"`
	Title                string          `json:"title"`
	Content              json.RawMessage `json:"content"` // JSONB payload representing CRDT elements
	OwnerID              string          `json:"owner_id"`
	SnapshotVersion      int             `json:"snapshot_version"`
	PublicSharingEnabled bool            `json:"public_sharing_enabled"`
	PublicSharingRole    string          `json:"public_sharing_role"`
	UserRole             string          `json:"user_role,omitempty"`
	CreatedAt            time.Time       `json:"created_at"`
	UpdatedAt            time.Time       `json:"updated_at"`
}

// Role specifies access rights on a document.
type Role string

const (
	RoleOwner  Role = "owner"
	RoleEditor Role = "editor"
	RoleViewer Role = "viewer"
)

// DocumentPermission details which users can read/write a document.
type DocumentPermission struct {
	DocID  string `json:"doc_id"`
	UserID string `json:"user_id"`
	Role   Role   `json:"role"`
}

// Collaborator joins a user's details with their document permission.
type Collaborator struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	Role   Role   `json:"role"`
}

// HistoryOp represents a user action formatted for history auditing.
type HistoryOp struct {
	OpType    string    `json:"opType"`
	Char      string    `json:"char"`
	Position  int       `json:"position"`
	UserID    string    `json:"userID"`
	UserName  string    `json:"userName"`
	CreatedAt time.Time `json:"createdAt"`
}
