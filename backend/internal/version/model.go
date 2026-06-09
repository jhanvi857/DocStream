package version

import (
	"encoding/json"
	"time"
)

type Op struct {
	ID          string          `json:"id"`
	DocID       string          `json:"doc_id"`
	UserID      string          `json:"user_id"`
	OpType      string          `json:"op_type"` // "insert" or "delete"
	CharID      string          `json:"char_id"`
	Char        string          `json:"char"`
	AfterID     string          `json:"after_id"`
	IsDeleted   bool            `json:"is_deleted"`
	VectorClock json.RawMessage `json:"vector_clock"`
	CreatedAt   time.Time       `json:"created_at"`
}
