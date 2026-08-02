package crdt

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

func TestCRDT_ConcurrentInterleavedEditing(t *testing.T) {
	// Root state: "Hello World"
	rootOps := []Op{
		{CharID: "r:1", Char: "H", AfterID: "", OpType: "insert"},
		{CharID: "r:2", Char: "e", AfterID: "r:1", OpType: "insert"},
		{CharID: "r:3", Char: "l", AfterID: "r:2", OpType: "insert"},
		{CharID: "r:4", Char: "l", AfterID: "r:3", OpType: "insert"},
		{CharID: "r:5", Char: "o", AfterID: "r:4", OpType: "insert"},
		{CharID: "r:6", Char: " ", AfterID: "r:5", OpType: "insert"},
		{CharID: "r:7", Char: "W", AfterID: "r:6", OpType: "insert"},
		{CharID: "r:8", Char: "o", AfterID: "r:7", OpType: "insert"},
		{CharID: "r:9", Char: "r", AfterID: "r:8", OpType: "insert"},
		{CharID: "r:10", Char: "l", AfterID: "r:9", OpType: "insert"},
		{CharID: "r:11", Char: "d", AfterID: "r:10", OpType: "insert"},
	}

	// Client A inserts " Beautiful" after "Hello"
	opsA := []Op{
		{CharID: "userA:1", Char: " ", AfterID: "r:5", OpType: "insert"},
		{CharID: "userA:2", Char: "B", AfterID: "userA:1", OpType: "insert"},
		{CharID: "userA:3", Char: "e", AfterID: "userA:2", OpType: "insert"},
		{CharID: "userA:4", Char: "a", AfterID: "userA:3", OpType: "insert"},
		{CharID: "userA:5", Char: "u", AfterID: "userA:4", OpType: "insert"},
		{CharID: "userA:6", Char: "t", AfterID: "userA:5", OpType: "insert"},
		{CharID: "userA:7", Char: "i", AfterID: "userA:6", OpType: "insert"},
		{CharID: "userA:8", Char: "f", AfterID: "userA:7", OpType: "insert"},
		{CharID: "userA:9", Char: "u", AfterID: "userA:8", OpType: "insert"},
		{CharID: "userA:10", Char: "l", AfterID: "userA:9", OpType: "insert"},
	}

	// Client B inserts "!" after "World" and deletes "r:6" (the space)
	opsB := []Op{
		{CharID: "userB:1", Char: "!", AfterID: "r:11", OpType: "insert"},
		{CharID: "r:6", OpType: "delete"},
	}

	// Document 1 receives Ops A then Ops B
	doc1 := NewCRDTDoc()
	for _, op := range rootOps {
		_ = doc1.Apply(op)
	}
	for _, op := range opsA {
		_ = doc1.Apply(op)
	}
	for _, op := range opsB {
		_ = doc1.Apply(op)
	}

	// Document 2 receives Ops B then Ops A (out of order arrival)
	doc2 := NewCRDTDoc()
	for _, op := range rootOps {
		_ = doc2.Apply(op)
	}
	for _, op := range opsB {
		_ = doc2.Apply(op)
	}
	for _, op := range opsA {
		_ = doc2.Apply(op)
	}

	text1 := doc1.ToText()
	text2 := doc2.ToText()

	if text1 != text2 {
		t.Errorf("CRDT documents failed convergence!\ndoc1: %q\ndoc2: %q", text1, text2)
	}
	if text1 != "Hello BeautifulWorld!" {
		t.Errorf("unexpected merged text: %q", text1)
	}
}
