package persistence

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// WALEntry represents a single operation logged in the WAL.
type WALEntry struct {
	Op   string // "I" for Insert, "S" for Select
	Word string
}

// WAL represents a thread-safe Write-Ahead Log file.
type WAL struct {
	file *os.File
	path string
	mu   sync.Mutex
}

// OpenWAL opens the WAL file at the given path. If it does not exist, it is created.
func OpenWAL(path string) (*WAL, error) {
	// Ensure parent directory exists
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create WAL directory: %w", err)
	}

	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		return nil, fmt.Errorf("failed to open WAL file: %w", err)
	}

	return &WAL{
		file: file,
		path: path,
	}, nil
}

// Append logs an operation and word to the WAL, syncing it to disk for durability.
func (w *WAL) Append(op string, word string) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	// Clean any newline characters to avoid corrupting the line-based log structure
	word = strings.ReplaceAll(word, "\n", "")
	entryLine := fmt.Sprintf("%s %s\n", op, word)

	if _, err := w.file.WriteString(entryLine); err != nil {
		return fmt.Errorf("failed to write to WAL: %w", err)
	}

	// Force write to disk storage
	if err := w.file.Sync(); err != nil {
		return fmt.Errorf("failed to sync WAL: %w", err)
	}

	return nil
}

// ReadEntries reads all logged operations in the WAL file. Used for recovery.
func (w *WAL) ReadEntries() ([]WALEntry, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	// Open file in read-only mode
	file, err := os.Open(w.path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil // No WAL file exists
		}
		return nil, fmt.Errorf("failed to open WAL for reading: %w", err)
	}
	defer file.Close()

	var entries []WALEntry
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.SplitN(line, " ", 2)
		if len(parts) < 2 {
			continue // Skip corrupted or empty lines
		}
		entries = append(entries, WALEntry{
			Op:   parts[0],
			Word: parts[1],
		})
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading WAL: %w", err)
	}

	return entries, nil
}

// Truncate clears the WAL file contents.
func (w *WAL) Truncate() error {
	w.mu.Lock()
	defer w.mu.Unlock()

	// Close current file
	if err := w.file.Close(); err != nil {
		return fmt.Errorf("failed to close WAL file before truncation: %w", err)
	}

	// Reopen with O_TRUNC to clear file
	file, err := os.OpenFile(w.path, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0666)
	if err != nil {
		return fmt.Errorf("failed to truncate WAL file: %w", err)
	}
	w.file = file

	return nil
}

// Close closes the WAL file handle.
func (w *WAL) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()

	if w.file != nil {
		return w.file.Close()
	}
	return nil
}
