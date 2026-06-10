package collab

import (
	"testing"
	"time"
)

func TestCRDTDoc_BasicInsert(t *testing.T) {
	doc := NewCRDTDoc()

	// Insert 'a' at start
	doc.Insert(Op{
		CharID:    "user1:1",
		Char:      "a",
		AfterID:   "",
		OpType:    "insert",
		CreatedAt: time.Now(),
	})

	// Insert 'b' after 'a'
	doc.Insert(Op{
		CharID:    "user1:2",
		Char:      "b",
		AfterID:   "user1:1",
		OpType:    "insert",
		CreatedAt: time.Now(),
	})

	// Insert 'c' after 'b'
	doc.Insert(Op{
		CharID:    "user1:3",
		Char:      "c",
		AfterID:   "user1:2",
		OpType:    "insert",
		CreatedAt: time.Now(),
	})

	got := doc.ToText()
	want := "abc"
	if got != want {
		t.Errorf("expected text %q, got %q", want, got)
	}
}

func TestCRDTDoc_BasicDelete(t *testing.T) {
	doc := NewCRDTDoc()

	// Build "abc"
	doc.Insert(Op{CharID: "user1:1", Char: "a", AfterID: "", OpType: "insert"})
	doc.Insert(Op{CharID: "user1:2", Char: "b", AfterID: "user1:1", OpType: "insert"})
	doc.Insert(Op{CharID: "user1:3", Char: "c", AfterID: "user1:2", OpType: "insert"})

	// Delete 'b'
	doc.Delete(Op{CharID: "user1:2", OpType: "delete"})

	got := doc.ToText()
	want := "ac"
	if got != want {
		t.Errorf("expected text %q, got %q", want, got)
	}

	// Verify that character count in array remains 3 (tombstones are preserved)
	if len(doc.Chars) != 3 {
		t.Errorf("expected 3 characters including tombstones, got %d", len(doc.Chars))
	}
}

func TestCRDTDoc_ConcurrentInsertTiebreaking(t *testing.T) {
	// Concurrent insertions after the same character must resolve identically
	// regardless of the arrival order.

	opX := Op{
		CharID:  "userA:1",
		Char:    "x",
		AfterID: "root:1",
		OpType:  "insert",
	}

	opY := Op{
		CharID:  "userB:1",
		Char:    "y",
		AfterID: "root:1",
		OpType:  "insert",
	}

	// Case 1: X arrives before Y
	doc1 := NewCRDTDoc()
	doc1.Insert(Op{CharID: "root:1", Char: "o", AfterID: "", OpType: "insert"})
	doc1.Insert(opX)
	doc1.Insert(opY)

	// Case 2: Y arrives before X
	doc2 := NewCRDTDoc()
	doc2.Insert(Op{CharID: "root:1", Char: "o", AfterID: "", OpType: "insert"})
	doc2.Insert(opY)
	doc2.Insert(opX)

	// In RGA conflict resolution, userB:1 > userA:1 lexicographically.
	// So 'y' must be placed immediately after the parent, and 'x' after 'y'.
	// Therefore, both must converge to "oyx".
	want := "oyx"

	if doc1.ToText() != want {
		t.Errorf("doc1 (X then Y) failed tiebreak, got %q, want %q", doc1.ToText(), want)
	}
	if doc2.ToText() != want {
		t.Errorf("doc2 (Y then X) failed tiebreak, got %q, want %q", doc2.ToText(), want)
	}
}

func TestCRDTDoc_ConcurrentDescendantTree(t *testing.T) {
	// Root state: "o"
	// User A inserts "x" after "o".
	// User B inserts "y" after "o", then userB:2 inserts "z" after "y".
	// Since userB:1 > userA:1, user B's branch (y, z) should precede user A's branch (x).
	// Therefore, final text must converge to "oyzx".

	opX := Op{CharID: "userA:1", Char: "x", AfterID: "root:1", OpType: "insert"}
	opY := Op{CharID: "userB:1", Char: "y", AfterID: "root:1", OpType: "insert"}
	opZ := Op{CharID: "userB:2", Char: "z", AfterID: "userB:1", OpType: "insert"}

	doc1 := NewCRDTDoc()
	doc1.Insert(Op{CharID: "root:1", Char: "o", AfterID: "", OpType: "insert"})
	doc1.Insert(opX)
	doc1.Insert(opY)
	doc1.Insert(opZ)

	doc2 := NewCRDTDoc()
	doc2.Insert(Op{CharID: "root:1", Char: "o", AfterID: "", OpType: "insert"})
	doc2.Insert(opY)
	doc2.Insert(opZ)
	doc2.Insert(opX)

	want := "oyzx"
	if doc1.ToText() != want {
		t.Errorf("doc1 failed tree convergence, got %q, want %q", doc1.ToText(), want)
	}
	if doc2.ToText() != want {
		t.Errorf("doc2 failed tree convergence, got %q, want %q", doc2.ToText(), want)
	}
}
