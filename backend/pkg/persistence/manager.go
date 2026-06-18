package persistence

import (
	"fmt"
	"log"
	"sync"
	"time"
	"docstream/pkg/trie"
)

// PersistenceManager orchestrates the WAL, snapshotting, and recovery of the Trie.
type PersistenceManager struct {
	trie          *trie.Trie
	wal           *WAL
	snapshotPath  string
	walPath       string
	maxWrites     int           // Snapshot trigger limit
	writeInterval time.Duration // Snapshot periodic timer

	// Mutex protects persistence state (writeCount and concurrent snapshot trigger)
	mu         sync.Mutex
	writeCount int
	closeChan  chan struct{}
	wg         sync.WaitGroup
}

// NewPersistenceManager creates and initializes a PersistenceManager.
func NewPersistenceManager(
	tr *trie.Trie,
	snapshotPath string,
	walPath string,
	maxWrites int,
	writeInterval time.Duration,
) (*PersistenceManager, error) {
	wal, err := OpenWAL(walPath)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize WAL: %w", err)
	}

	pm := &PersistenceManager{
		trie:          tr,
		wal:           wal,
		snapshotPath:  snapshotPath,
		walPath:       walPath,
		maxWrites:     maxWrites,
		writeInterval: writeInterval,
		closeChan:     make(chan struct{}),
	}

	return pm, nil
}

// Recover loads the latest snapshot and replays any outstanding WAL logs.
func (pm *PersistenceManager) Recover() error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	// 1. Load the snapshot
	snapshotEntries, err := LoadSnapshot(pm.snapshotPath)
	if err != nil {
		return fmt.Errorf("failed to recover from snapshot: %w", err)
	}

	if len(snapshotEntries) > 0 {
		pm.trie.LoadSnapshot(snapshotEntries)
		log.Printf("[Recovery] Successfully loaded %d words from snapshot", len(snapshotEntries))
	}

	// 2. Read and replay WAL entries
	walEntries, err := pm.wal.ReadEntries()
	if err != nil {
		return fmt.Errorf("failed to read WAL during recovery: %w", err)
	}

	if len(walEntries) > 0 {
		log.Printf("[Recovery] Replaying %d entries from WAL...", len(walEntries))
		for _, entry := range walEntries {
			switch entry.Op {
			case "I":
				pm.trie.Insert(entry.Word)
			case "S":
				pm.trie.Select(entry.Word)
			default:
				log.Printf("[Recovery] Warning: Unknown WAL operation: %s", entry.Op)
			}
		}
		log.Printf("[Recovery] Replay finished.")
	}

	return nil
}

// StartBackgroundTasks runs the background routine for periodic snapshotting.
func (pm *PersistenceManager) StartBackgroundTasks() {
	if pm.writeInterval <= 0 {
		return
	}

	pm.wg.Add(1)
	go func() {
		defer pm.wg.Done()
		ticker := time.NewTicker(pm.writeInterval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				pm.mu.Lock()
				shouldSnapshot := pm.writeCount > 0
				pm.mu.Unlock()

				if shouldSnapshot {
					log.Println("[Persistence] Ticker triggered periodic snapshotting...")
					if err := pm.CreateSnapshot(); err != nil {
						log.Printf("[Persistence] Error during periodic snapshot: %v", err)
					}
				}
			case <-pm.closeChan:
				return
			}
		}
	}()
}

// Insert writes the word insertion operation to the WAL, then applies it to the Trie.
func (pm *PersistenceManager) Insert(word string) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	// 1. Write to WAL first
	if err := pm.wal.Append("I", word); err != nil {
		return fmt.Errorf("failed to write insert to WAL: %w", err)
	}

	// 2. Apply to Trie
	pm.trie.Insert(word)

	// 3. Track write threshold
	pm.writeCount++
	if pm.maxWrites > 0 && pm.writeCount >= pm.maxWrites {
		// Release lock before running CreateSnapshot because CreateSnapshot uses its own lock block
		pm.mu.Unlock()
		defer pm.mu.Lock() // Re-acquire lock for the defer block to unlock cleanly
		if err := pm.CreateSnapshot(); err != nil {
			log.Printf("[Persistence] Error during threshold snapshot: %v", err)
		}
	}

	return nil
}

// Select writes the word selection operation to the WAL, then applies it to the Trie.
func (pm *PersistenceManager) Select(word string) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	// 1. Write to WAL first
	if err := pm.wal.Append("S", word); err != nil {
		return fmt.Errorf("failed to write select to WAL: %w", err)
	}

	// 2. Apply to Trie
	pm.trie.Select(word)

	// 3. Track write threshold
	pm.writeCount++
	if pm.maxWrites > 0 && pm.writeCount >= pm.maxWrites {
		pm.mu.Unlock()
		defer pm.mu.Lock()
		if err := pm.CreateSnapshot(); err != nil {
			log.Printf("[Persistence] Error during threshold snapshot: %v", err)
		}
	}

	return nil
}

// CreateSnapshot serializes Trie data to disk, truncates the WAL, and resets the write count.
func (pm *PersistenceManager) CreateSnapshot() error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	log.Printf("[Persistence] Creating snapshot at %s...", pm.snapshotPath)
	
	// Export words from the Trie
	entries := pm.trie.ExportWords()

	// Save to JSON snapshot file
	if err := SaveSnapshot(pm.snapshotPath, entries); err != nil {
		return fmt.Errorf("failed to write snapshot: %w", err)
	}

	// Truncate the WAL
	if err := pm.wal.Truncate(); err != nil {
		return fmt.Errorf("failed to truncate WAL: %w", err)
	}

	pm.writeCount = 0
	log.Println("[Persistence] Snapshot created successfully. WAL truncated.")
	return nil
}

// Close stops the periodic snapshotting and closes all file descriptors after flushing memory to disk.
func (pm *PersistenceManager) Close() error {
	// 1. Signal background routines to stop
	close(pm.closeChan)
	pm.wg.Wait()

	pm.mu.Lock()
	defer pm.mu.Unlock()

	var snapshotErr error
	// 2. Flush final state to snapshot if there are un-checkpointed writes
	if pm.writeCount > 0 {
		log.Println("[Persistence] Flushing final state to snapshot on close...")
		entries := pm.trie.ExportWords()
		if err := SaveSnapshot(pm.snapshotPath, entries); err != nil {
			snapshotErr = fmt.Errorf("failed to write final snapshot on close: %w", err)
		} else {
			_ = pm.wal.Truncate() // Best effort WAL truncate
		}
	}

	// 3. Close the WAL file
	if err := pm.wal.Close(); err != nil {
		return fmt.Errorf("failed to close WAL: %w", err)
	}

	return snapshotErr
}
