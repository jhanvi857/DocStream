package crdt

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// represent a single character node in the sequence CRDT.
type CRDTChar struct {
	ID        string `json:"id"`         // Format: "userID:logicalClock"
	Char      string `json:"char"`       // The character value (string to support multi-byte emojis)
	AfterID   string `json:"after_id"`   // ID of the preceding character (empty if at start)
	IsDeleted bool   `json:"is_deleted"` // Tombstone marker
}

// the ordered sequence of character nodes.
type CRDTDoc struct {
	Chars []*CRDTChar `json:"chars"`
}

func NewCRDTDoc() *CRDTDoc {
	return &CRDTDoc{Chars: make([]*CRDTChar, 0)}
}

// single collaborative operation to apply.
type Op struct {
	ID          string            `json:"id"`
	DocID       string            `json:"doc_id"`
	UserID      string            `json:"user_id"`
	OpType      string            `json:"op_type"` // "insert" or "delete"
	CharID      string            `json:"char_id"`
	Char        string            `json:"char"`
	AfterID     string            `json:"after_id"`
	IsDeleted   bool              `json:"is_deleted"`
	VectorClock map[string]uint64 `json:"vector_clock"`
	CreatedAt   time.Time         `json:"created_at"`
}

func (d *CRDTDoc) Apply(op Op) error {
	switch op.OpType {
	case "insert":
		return d.Insert(op)
	case "delete":
		d.Delete(op)
	default:
		return fmt.Errorf("unknown operation type: %s", op.OpType)
	}
	return nil
}

func (d *CRDTDoc) Insert(op Op) error {
	// Prevent duplicate applications of the same operation ID
	for _, c := range d.Chars {
		if c.ID == op.CharID {
			return nil
		}
	}

	newChar := &CRDTChar{
		ID:        op.CharID,
		Char:      op.Char,
		AfterID:   op.AfterID,
		IsDeleted: false,
	}

	// 1. Locate the insert baseline position
	insertIdx := -1
	if op.AfterID != "" {
		for i, c := range d.Chars {
			if c.ID == op.AfterID {
				insertIdx = i
				break
			}
		}
		// If the requested parent ID is missing, fallback to appending at the end of the document
		if insertIdx == -1 {
			insertIdx = len(d.Chars) - 1
		}
	}

	// 2. Resolve concurrent inserts (RGA scan forward)
	// We advance past any elements that were concurrent - inserted after the same parent or its descendants whose ID is lexicographically greater than our new ID.
	skipped := make(map[string]bool)
	scanIdx := insertIdx + 1

	for scanIdx < len(d.Chars) {
		curr := d.Chars[scanIdx]
		isSibling := curr.AfterID == op.AfterID
		isDescendant := skipped[curr.AfterID]

		if isSibling || isDescendant {
			if isDescendant || curr.ID > op.CharID {
				skipped[curr.ID] = true
				scanIdx++
			} else {
				break
			}
		} else {
			break
		}
	}

	// 3. Insert character node at resolved index
	d.Chars = append(d.Chars, nil)
	copy(d.Chars[scanIdx+1:], d.Chars[scanIdx:])
	d.Chars[scanIdx] = newChar
	return nil
}

// Delete marks a character node as a tombstone.
func (d *CRDTDoc) Delete(op Op) {
	for _, c := range d.Chars {
		if c.ID == op.CharID {
			c.IsDeleted = true
			break
		}
	}
}

// construct the plain text representation of the document, skipping tombstones.
func (d *CRDTDoc) ToText() string {
	var sb strings.Builder
	for _, c := range d.Chars {
		if !c.IsDeleted {
			sb.WriteString(c.Char)
		}
	}
	return sb.String()
}

// serialize the document state including tombstones to JSON bytes.
func (d *CRDTDoc) ToJSON() ([]byte, error) {
	return json.Marshal(d.Chars)
}

// parse document state back into a CRDTDoc struct.
func FromJSON(data []byte) (*CRDTDoc, error) {
	var chars []*CRDTChar
	if len(data) > 0 && string(data) != "null" && string(data) != "[]" {
		if err := json.Unmarshal(data, &chars); err != nil {
			return nil, err
		}
	}
	return &CRDTDoc{Chars: chars}, nil
}
