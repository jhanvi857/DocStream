package typeahead

import (
	"context"
	"fmt"
	"log/slog"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"

	"docstream/pkg/persistence"
	"docstream/pkg/trie"
)

// CollaboratorLoader is a callback function to fetch collaborators for a document from database.
type CollaboratorLoader func(ctx context.Context, docID string) ([]string, error)

// DocMentionTrie wraps a Trie and PersistenceManager for a specific document.
type DocMentionTrie struct {
	Trie     *trie.Trie
	PM       *persistence.PersistenceManager
	LastUsed time.Time
	Closing  bool
	Closed   chan struct{}
	Mu       sync.RWMutex
}

// Service manages the global titles Trie and document-specific mention Tries.
type Service struct {
	titlesTrie   *trie.Trie
	titlesPM     *persistence.PersistenceManager
	loader       CollaboratorLoader
	dataDir      string
	failedWrites int64

	mentionsMu sync.RWMutex
	mentions   map[string]*DocMentionTrie

	closeChan chan struct{}
	wg        sync.WaitGroup
}

// NewService creates a new Typeahead Service.
func NewService(dataDir string, loader CollaboratorLoader) (*Service, error) {
	// Initialize Titles Trie
	titlesTrie := trie.NewTrie(50000) // budget: 50k titles
	titlesSnapshot := filepath.Join(dataDir, "titles", "snapshot.json")
	titlesWAL := filepath.Join(dataDir, "titles", "wal.log")

	titlesPM, err := persistence.NewPersistenceManager(titlesTrie, titlesSnapshot, titlesWAL, 100, 5*time.Minute)
	if err != nil {
		return nil, fmt.Errorf("failed to create titles persistence manager: %w", err)
	}

	// Recover titles state
	if err := titlesPM.Recover(); err != nil {
		slog.Error("failed to recover titles typeahead state", "error", err)
	}
	titlesPM.StartBackgroundTasks()

	s := &Service{
		titlesTrie: titlesTrie,
		titlesPM:   titlesPM,
		loader:     loader,
		dataDir:    dataDir,
		mentions:   make(map[string]*DocMentionTrie),
		closeChan:  make(chan struct{}),
	}

	// Start a background janitor to clean up inactive mention tries
	s.wg.Add(1)
	go s.runJanitor(10 * time.Minute)

	return s, nil
}

// GetFailedWrites returns the count of failed async persist writes.
func (s *Service) GetFailedWrites() int64 {
	return atomic.LoadInt64(&s.failedWrites)
}

// runJanitor periodic clean up of inactive tries to save memory.
func (s *Service) runJanitor(interval time.Duration) {
	defer s.wg.Done()
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.mentionsMu.Lock()
			now := time.Now()
			var idleMentions []*DocMentionTrie
			var idleDocIDs []string

			for docID, mt := range s.mentions {
				mt.Mu.Lock()
				isIdle := now.Sub(mt.LastUsed) > 30*time.Minute && !mt.Closing
				if isIdle {
					mt.Closing = true
					idleMentions = append(idleMentions, mt)
					idleDocIDs = append(idleDocIDs, docID)
				}
				mt.Mu.Unlock()
			}
			s.mentionsMu.Unlock()

			// Close and flush idle tries without holding mentionsMu
			for i, mt := range idleMentions {
				docID := idleDocIDs[i]
				slog.Info("unloading inactive mentions trie from memory", "docID", docID)
				if err := mt.PM.Close(); err != nil {
					slog.Error("error closing PM for mentions trie", "docID", docID, "error", err)
				}

				// Re-acquire lock to delete and signal any waiting requests
				s.mentionsMu.Lock()
				delete(s.mentions, docID)
				close(mt.Closed)
				s.mentionsMu.Unlock()
			}
		case <-s.closeChan:
			return
		}
	}
}

// Close gracefully closes all active persistence managers.
func (s *Service) Close() error {
	close(s.closeChan)
	s.wg.Wait()

	var errs []error
	if err := s.titlesPM.Close(); err != nil {
		errs = append(errs, fmt.Errorf("failed to close titles PM: %w", err))
	}

	s.mentionsMu.Lock()
	defer s.mentionsMu.Unlock()

	for docID, mt := range s.mentions {
		if err := mt.PM.Close(); err != nil {
			errs = append(errs, fmt.Errorf("failed to close mentions PM for doc %s: %w", docID, err))
		}
		delete(s.mentions, docID)
	}

	if len(errs) > 0 {
		return fmt.Errorf("errors closing typeahead service: %v", errs)
	}
	return nil
}

// runAsync executes a mutating Trie/Persistence operation with bounded retries and logging.
func (s *Service) runAsync(opName string, fn func() error) {
	go func() {
		backoff := 50 * time.Millisecond
		var err error
		for attempt := 1; attempt <= 3; attempt++ {
			if err = fn(); err == nil {
				return
			}
			slog.Warn("async write operation failed, retrying",
				"operation", opName,
				"attempt", attempt,
				"error", err,
			)
			time.Sleep(backoff)
			backoff *= 2
		}
		slog.Error("async write operation failed permanently after retries",
			"operation", opName,
			"error", err,
		)
		atomic.AddInt64(&s.failedWrites, 1)
	}()
}

// InsertTitle adds a document title to the global titles trie asynchronously.
func (s *Service) InsertTitle(docID string, title string) {
	entry := fmt.Sprintf("%s|%s", title, docID)
	s.runAsync("InsertTitle:"+entry, func() error {
		return s.titlesPM.Insert(entry)
	})
}

// SuggestTitles returns suggestions for document titles.
func (s *Service) SuggestTitles(prefix string, limit int) []trie.Suggestion {
	return s.titlesTrie.Suggest(prefix, limit)
}

// getOrCreateMentionTrie returns the mention trie for a document, loading it if not cached.
func (s *Service) getOrCreateMentionTrie(ctx context.Context, docID string) (*DocMentionTrie, error) {
	s.mentionsMu.RLock()
	mt, exists := s.mentions[docID]
	s.mentionsMu.RUnlock()

	if exists {
		mt.Mu.Lock()
		if !mt.Closing {
			mt.LastUsed = time.Now()
			mt.Mu.Unlock()
			return mt, nil
		}
		mt.Mu.Unlock()

		// If it is closing, wait for it to finish and retry
		<-mt.Closed
		return s.getOrCreateMentionTrie(ctx, docID)
	}

	s.mentionsMu.Lock()
	// Double-check check under write lock
	if mt, exists = s.mentions[docID]; exists {
		s.mentionsMu.Unlock()
		mt.Mu.Lock()
		if !mt.Closing {
			mt.LastUsed = time.Now()
			mt.Mu.Unlock()
			return mt, nil
		}
		mt.Mu.Unlock()

		// If it is closing, wait for it to finish and retry
		<-mt.Closed
		return s.getOrCreateMentionTrie(ctx, docID)
	}

	// Lazy load Trie
	slog.Info("lazy-loading mentions trie", "docID", docID)
	
	mtTrie := trie.NewTrie(1000) // max budget per document: 1000 collaborator names/emails
	snapshotPath := filepath.Join(s.dataDir, "mentions", fmt.Sprintf("%s_snapshot.json", docID))
	walPath := filepath.Join(s.dataDir, "mentions", fmt.Sprintf("%s_wal.log", docID))

	pm, err := persistence.NewPersistenceManager(mtTrie, snapshotPath, walPath, 20, 2*time.Minute)
	if err != nil {
		s.mentionsMu.Unlock()
		return nil, fmt.Errorf("failed to create mentions PM: %w", err)
	}

	// Recover mentions frequency counts from disk
	if err := pm.Recover(); err != nil {
		slog.Error("failed to recover mentions PM state", "docID", docID, "error", err)
	}
	pm.StartBackgroundTasks()

	// Load current collaborators from DB and populate Trie
	collaborators, err := s.loader(ctx, docID)
	if err != nil {
		s.mentionsMu.Unlock()
		// Close PM to release locks before returning
		_ = pm.Close()
		return nil, fmt.Errorf("failed to load collaborators from database: %w", err)
	}

	// Insert collaborators with a baseline frequency if they do not exist
	for _, email := range collaborators {
		if mtTrie.GetWordFrequency(email) == 0 {
			mtTrie.Insert(email)
		}
	}

	newMt := &DocMentionTrie{
		Trie:     mtTrie,
		PM:       pm,
		LastUsed: time.Now(),
		Closed:   make(chan struct{}),
	}

	s.mentions[docID] = newMt
	s.mentionsMu.Unlock()
	return newMt, nil
}

// SuggestMentions returns suggestions for collaborator mentions within a document.
func (s *Service) SuggestMentions(ctx context.Context, docID string, prefix string, limit int) ([]trie.Suggestion, error) {
	mt, err := s.getOrCreateMentionTrie(ctx, docID)
	if err != nil {
		return nil, err
	}

	mt.Mu.RLock()
	defer mt.Mu.RUnlock()
	
	// Use FuzzySuggest for typo tolerance on mentions
	return mt.Trie.FuzzySuggest(prefix, limit), nil
}

// SelectMention records a selection event for a collaborator mention in a document.
func (s *Service) SelectMention(ctx context.Context, docID string, email string) error {
	mt, err := s.getOrCreateMentionTrie(ctx, docID)
	if err != nil {
		return err
	}

	s.runAsync("SelectMention:"+docID+":"+email, func() error {
		return mt.PM.Select(email)
	})
	return nil
}

// InsertCollaborator inserts a single collaborator name/email when shared.
func (s *Service) InsertCollaborator(ctx context.Context, docID string, email string) error {
	mt, err := s.getOrCreateMentionTrie(ctx, docID)
	if err != nil {
		return err
	}

	s.runAsync("InsertCollaborator:"+docID+":"+email, func() error {
		return mt.PM.Insert(email)
	})
	return nil
}
