package persistence

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"docstream/pkg/trie"
)

// SaveSnapshot serializes the Trie's snapshot entries to the specified file path.
// It uses a temporary file and atomic rename to ensure the snapshot isn't corrupted if the process crashes mid-write.
func SaveSnapshot(path string, entries []trie.SnapshotEntry) error {
	// Ensure destination directory exists
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create snapshot directory: %w", err)
	}

	// Create temporary file
	tempFile, err := os.CreateTemp(dir, "snapshot_temp_*.json")
	if err != nil {
		return fmt.Errorf("failed to create temp file for snapshot: %w", err)
	}
	defer func() {
		// Clean up the temp file if we exit before renaming it
		tempFile.Close()
		os.Remove(tempFile.Name())
	}()

	// Serialize snapshot entries to JSON
	encoder := json.NewEncoder(tempFile)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(entries); err != nil {
		return fmt.Errorf("failed to encode snapshot entries: %w", err)
	}

	// Ensure content is synced to physical disk
	if err := tempFile.Sync(); err != nil {
		return fmt.Errorf("failed to sync snapshot file: %w", err)
	}

	// Close temp file handle
	if err := tempFile.Close(); err != nil {
		return fmt.Errorf("failed to close temp snapshot file: %w", err)
	}

	// Atomic rename to replace the actual snapshot file
	if err := os.Rename(tempFile.Name(), path); err != nil {
		return fmt.Errorf("failed to rename temp snapshot file to destination: %w", err)
	}

	return nil
}

// LoadSnapshot reads and deserializes the snapshot from the given file path.
func LoadSnapshot(path string) ([]trie.SnapshotEntry, error) {
	file, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil // No snapshot exists yet, start fresh
		}
		return nil, fmt.Errorf("failed to open snapshot file: %w", err)
	}
	defer file.Close()

	var entries []trie.SnapshotEntry
	decoder := json.NewDecoder(file)
	if err := decoder.Decode(&entries); err != nil {
		if err == io.EOF {
			return nil, nil // Empty snapshot file
		}
		return nil, fmt.Errorf("failed to decode snapshot: %w", err)
	}

	return entries, nil
}
