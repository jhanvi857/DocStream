package persistence

import (
	"os"
	"path/filepath"
	"testing"
	"time"
	"docstream/pkg/trie"
)

func TestPersistenceBasicFlow(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "typeahead_persistence_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	snapshotPath := filepath.Join(tempDir, "snapshot.json")
	walPath := filepath.Join(tempDir, "wal.log")

	tr := trie.NewTrie(10)
	pm, err := NewPersistenceManager(tr, snapshotPath, walPath, 5, 0)
	if err != nil {
		t.Fatalf("failed to create persistence manager: %v", err)
	}

	// Insert words
	if err := pm.Insert("apple"); err != nil {
		t.Errorf("Insert failed: %v", err)
	}
	if err := pm.Insert("banana"); err != nil {
		t.Errorf("Insert failed: %v", err)
	}
	if err := pm.Select("apple"); err != nil {
		t.Errorf("Select failed: %v", err)
	}

	// Check Trie has correct values
	if tr.GetWordFrequency("apple") != 2 {
		t.Errorf("Expected apple frequency to be 2, got %d", tr.GetWordFrequency("apple"))
	}
	if tr.GetWordFrequency("banana") != 1 {
		t.Errorf("Expected banana frequency to be 1, got %d", tr.GetWordFrequency("banana"))
	}

	// Close to save and flush
	if err := pm.Close(); err != nil {
		t.Fatalf("Close failed: %v", err)
	}

	// Recreate Trie and recover
	trRecovered := trie.NewTrie(10)
	pmRecovered, err := NewPersistenceManager(trRecovered, snapshotPath, walPath, 5, 0)
	if err != nil {
		t.Fatalf("failed to create recovered persistence manager: %v", err)
	}
	defer pmRecovered.Close()

	if err := pmRecovered.Recover(); err != nil {
		t.Fatalf("Recover failed: %v", err)
	}

	// Verify recovered data
	if trRecovered.GetWordFrequency("apple") != 2 {
		t.Errorf("Expected recovered apple frequency to be 2, got %d", trRecovered.GetWordFrequency("apple"))
	}
	if trRecovered.GetWordFrequency("banana") != 1 {
		t.Errorf("Expected recovered banana frequency to be 1, got %d", trRecovered.GetWordFrequency("banana"))
	}
}

func TestPersistenceSnapshotThreshold(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "typeahead_persistence_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	snapshotPath := filepath.Join(tempDir, "snapshot.json")
	walPath := filepath.Join(tempDir, "wal.log")

	tr := trie.NewTrie(10)
	// Set threshold of 3 writes
	pm, err := NewPersistenceManager(tr, snapshotPath, walPath, 3, 0)
	if err != nil {
		t.Fatalf("failed to create persistence manager: %v", err)
	}

	// 1st write
	pm.Insert("one")
	// 2nd write
	pm.Insert("two")

	// Verify snapshot file does not exist yet (as threshold 3 is not reached)
	if _, err := os.Stat(snapshotPath); !os.IsNotExist(err) {
		t.Errorf("Expected snapshot file NOT to exist yet")
	}

	// 3rd write -> should trigger snapshot and truncate WAL
	if err := pm.Insert("three"); err != nil {
		t.Fatalf("Insert failed: %v", err)
	}

	// Give a tiny moment for filesystem sync if needed, though functions are synchronous here
	if _, err := os.Stat(snapshotPath); os.IsNotExist(err) {
		t.Errorf("Expected snapshot file to exist after 3 writes")
	}

	// Verify WAL is truncated (should have size 0)
	walInfo, err := os.Stat(walPath)
	if err != nil {
		t.Fatalf("Failed to stat WAL: %v", err)
	}
	if walInfo.Size() != 0 {
		t.Errorf("Expected truncated WAL size to be 0, got %d", walInfo.Size())
	}

	pm.Close()
}

func TestPersistencePeriodicSnapshot(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "typeahead_persistence_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	snapshotPath := filepath.Join(tempDir, "snapshot.json")
	walPath := filepath.Join(tempDir, "wal.log")

	tr := trie.NewTrie(10)
	// Set threshold of 100 writes but 50ms periodic time
	pm, err := NewPersistenceManager(tr, snapshotPath, walPath, 100, 50*time.Millisecond)
	if err != nil {
		t.Fatalf("failed to create persistence manager: %v", err)
	}
	pm.StartBackgroundTasks()

	// Write one word
	pm.Insert("hello")

	// Verify snapshot does not exist immediately
	if _, err := os.Stat(snapshotPath); !os.IsNotExist(err) {
		t.Errorf("Expected snapshot file NOT to exist yet")
	}

	// Wait 150ms for periodic task to run
	time.Sleep(150 * time.Millisecond)

	// Verify snapshot exists now
	if _, err := os.Stat(snapshotPath); os.IsNotExist(err) {
		t.Errorf("Expected periodic snapshot to have occurred")
	}

	pm.Close()
}
