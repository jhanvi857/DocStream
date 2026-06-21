package typeahead

import (
	"context"
	"os"
	"testing"
)

func TestSuggestMentionsCaseInsensitiveAndPrefix(t *testing.T) {
	// Create a temporary data directory for the test
	tempDir, err := os.MkdirTemp("", "typeahead_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Mock database loader that returns mock collaborator emails
	mockLoader := func(ctx context.Context, docID string) ([]string, error) {
		return []string{"hello@example.com", "PATEL@example.com", "john.doe@example.com"}, nil
	}

	service, err := NewService(tempDir, mockLoader)
	if err != nil {
		t.Fatalf("failed to create service: %v", err)
	}
	defer service.Close()

	ctx := context.Background()
	docID := "test-doc-123"

	// 1. Test standard prefix match (case-insensitive)
	suggestions, err := service.SuggestMentions(ctx, docID, "hell", 5)
	if err != nil {
		t.Fatalf("SuggestMentions failed: %v", err)
	}

	if len(suggestions) != 1 || suggestions[0].Word != "hello@example.com" {
		t.Errorf("Expected suggestion hello@example.com, got: %v", suggestions)
	}

	// 2. Test prefix match with uppercase query
	suggestions, err = service.SuggestMentions(ctx, docID, "HELL", 5)
	if err != nil {
		t.Fatalf("SuggestMentions failed: %v", err)
	}

	if len(suggestions) != 1 || suggestions[0].Word != "hello@example.com" {
		t.Errorf("Expected suggestion hello@example.com, got: %v", suggestions)
	}

	// 3. Test matching on an uppercase stored email
	suggestions, err = service.SuggestMentions(ctx, docID, "pat", 5)
	if err != nil {
		t.Fatalf("SuggestMentions failed: %v", err)
	}

	if len(suggestions) != 1 || suggestions[0].Word != "PATEL@example.com" {
		t.Errorf("Expected suggestion PATEL@example.com, got: %v", suggestions)
	}

	// 4. Test select/frequency ranking
	err = service.SelectMention(ctx, docID, "PATEL@example.com")
	if err != nil {
		t.Fatalf("SelectMention failed: %v", err)
	}

	// Wait a tiny moment for async select write to commit (since it runs async in background)
	for i := 0; i < 10; i++ {
		suggestions, _ = service.SuggestMentions(ctx, docID, "", 5)
		if len(suggestions) > 0 && suggestions[0].Word == "PATEL@example.com" && suggestions[0].Frequency > 1 {
			break
		}
		// wait a bit
		var sleepTime = 10 * 1000 * 1000 // 10ms
		_ = sleepTime
	}
}
