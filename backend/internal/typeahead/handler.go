package typeahead

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"docstream/internal/auth"
	"docstream/internal/collab"
	"docstream/internal/crdt"
	"docstream/internal/document"
	pkgErrors "docstream/pkg/errors"
	"docstream/pkg/trie"

	"github.com/go-chi/chi/v5"
)

// Handler serves autocomplete and select endpoints.
type Handler struct {
	typeaheadService *Service
	docService       document.Service
	hub              *collab.Hub
}

// NewHandler instantiates a new typeahead HTTP Handler.
func NewHandler(ts *Service, ds document.Service, hub *collab.Hub) *Handler {
	return &Handler{
		typeaheadService: ts,
		docService:       ds,
		hub:              hub,
	}
}

// verifyAccess is a helper that checks permissions for a user on a document.
func (h *Handler) verifyAccess(r *http.Request, docID string, userID string, minRole document.Role, forbiddenMsg string) *pkgErrors.AppError {
	hasAccess, err := h.docService.VerifyPermission(r.Context(), docID, userID, minRole)
	if err != nil {
		return pkgErrors.NewInternalError(err.Error())
	}
	if !hasAccess {
		return pkgErrors.NewForbiddenError(forbiddenMsg)
	}
	return nil
}

// SuggestTitles handles autocompleting document titles with permission-based filtering.
func (h *Handler) SuggestTitles(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		pkgErrors.NewUnauthorizedError("unauthorized").WriteJSON(w)
		return
	}

	q := r.URL.Query().Get("q")
	limit := 10
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if val, err := strconv.Atoi(limitStr); err == nil && val > 0 {
			limit = val
		}
	}

	var filteredSuggestions []trie.Suggestion
	candidateLimit := limit * 3

	// Adaptive query loop to solve the pagination-before-filtering info leak bug.
	for {
		rawSuggestions := h.typeaheadService.SuggestTitles(q, candidateLimit)
		if len(rawSuggestions) == 0 {
			break
		}

		var docIDs []string
		type suggestionWithDocID struct {
			title string
			docID string
			freq  int64
		}
		var parsedSuggestions []suggestionWithDocID

		for _, s := range rawSuggestions {
			// Title entries are stored as "title|docID"
			parts := strings.SplitN(s.Word, "|", 2)
			if len(parts) == 2 {
				docIDs = append(docIDs, parts[1])
				parsedSuggestions = append(parsedSuggestions, suggestionWithDocID{
					title: parts[0],
					docID: parts[1],
					freq:  s.Frequency,
				})
			} else {
				// Fallback for any legacy entries
				parsedSuggestions = append(parsedSuggestions, suggestionWithDocID{
					title: s.Word,
					docID: "",
					freq:  s.Frequency,
				})
			}
		}

		// Perform a single, bulk DB query checking access permissions on the found document IDs
		allowedMap, err := h.docService.HasAccessToDocs(r.Context(), userID, docIDs)
		if err != nil {
			pkgErrors.NewInternalError(err.Error()).WriteJSON(w)
			return
		}

		filteredSuggestions = filteredSuggestions[:0] // Reset slice but preserve capacity
		for _, ps := range parsedSuggestions {
			// Note: allowedMap[ps.docID] will evaluate to false (the zero value) if ps.docID is not present.
			// This leverages Go's fail-closed zero-value semantics to deny access when mapping is missing.
			if ps.docID == "" || allowedMap[ps.docID] {
				filteredSuggestions = append(filteredSuggestions, trie.Suggestion{
					Word:      ps.title,
					Frequency: ps.freq,
				})
				if len(filteredSuggestions) >= limit {
					break
				}
			}
		}

		// If we collected enough allowed suggestions, or if the Trie has returned fewer candidates 
		// than requested (meaning there are no more matches under this prefix), we terminate the loop.
		if len(filteredSuggestions) >= limit || len(rawSuggestions) < candidateLimit {
			break
		}

		// Otherwise, double the candidate pool limit and retry
		candidateLimit *= 2
		if candidateLimit > 1000 { // Bounded ceiling to prevent memory pressure or infinite loops
			break
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(filteredSuggestions)
}

// SuggestMentions handles autocompleting user mentions inside a specific document.
func (h *Handler) SuggestMentions(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		pkgErrors.NewUnauthorizedError("unauthorized").WriteJSON(w)
		return
	}

	docID := chi.URLParam(r, "id")
	if docID == "" {
		pkgErrors.NewValidationError("missing document id").WriteJSON(w)
		return
	}

	// Verify the user has access to view this document
	if appErr := h.verifyAccess(r, docID, userID, document.RoleViewer, "forbidden: insufficient permission to view document mentions"); appErr != nil {
		appErr.WriteJSON(w)
		return
	}

	q := r.URL.Query().Get("q")
	q = strings.TrimPrefix(q, "@")
	limit := 10
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if val, err := strconv.Atoi(limitStr); err == nil && val > 0 {
			limit = val
		}
	}

	suggestions, err := h.typeaheadService.SuggestMentions(r.Context(), docID, q, limit)
	if err != nil {
		pkgErrors.NewInternalError(err.Error()).WriteJSON(w)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(suggestions)
}

// SelectMention records when a mention suggestion is selected by the user.
func (h *Handler) SelectMention(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		pkgErrors.NewUnauthorizedError("unauthorized").WriteJSON(w)
		return
	}

	docID := chi.URLParam(r, "id")
	if docID == "" {
		pkgErrors.NewValidationError("missing document id").WriteJSON(w)
		return
	}

	// Verify the user has access to edit/view this document
	if appErr := h.verifyAccess(r, docID, userID, document.RoleViewer, "forbidden: insufficient permission to access this document"); appErr != nil {
		appErr.WriteJSON(w)
		return
	}

	type selectRequest struct {
		Word string `json:"word"`
	}

	var req selectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		pkgErrors.NewValidationError("invalid request body").WriteJSON(w)
		return
	}

	if req.Word == "" {
		pkgErrors.NewValidationError("word is required").WriteJSON(w)
		return
	}

	if err := h.typeaheadService.SelectMention(r.Context(), docID, req.Word); err != nil {
		pkgErrors.NewInternalError(err.Error()).WriteJSON(w)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "mention selection recorded"})
}

// SuggestWords handles autocompleting local document words for inline autocomplete.
func (h *Handler) SuggestWords(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		pkgErrors.NewUnauthorizedError("unauthorized").WriteJSON(w)
		return
	}

	docID := chi.URLParam(r, "id")
	if docID == "" {
		pkgErrors.NewValidationError("missing document id").WriteJSON(w)
		return
	}

	// Verify the user has access to view this document
	if appErr := h.verifyAccess(r, docID, userID, document.RoleViewer, "forbidden: insufficient permission to view document"); appErr != nil {
		appErr.WriteJSON(w)
		return
	}

	q := r.URL.Query().Get("q")
	limit := 5
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if val, err := strconv.Atoi(limitStr); err == nil && val > 0 {
			limit = val
		}
	}

	var suggestions []trie.Suggestion

	// Check if the document session is active in the Hub
	session := h.hub.GetActiveSession(docID)
	if session != nil {
		// Document is currently open/edited in memory
		suggestions = session.SuggestWords(q, limit)
	} else {
		// Document is inactive - load the text from the DB and build a temp trie
		doc, err := h.docService.GetByID(r.Context(), docID, userID)
		if err != nil {
			pkgErrors.NewInternalError(err.Error()).WriteJSON(w)
			return
		}

		crdtDoc, err := crdt.FromJSON(doc.Content)
		if err != nil {
			pkgErrors.NewInternalError(err.Error()).WriteJSON(w)
			return
		}

		text := crdtDoc.ToText()
		words := extractWords(text)
		
		tempTrie := trie.NewTrie(10000)
		for _, w := range words {
			tempTrie.Insert(w)
		}
		suggestions = tempTrie.Suggest(q, limit)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(suggestions)
}

func extractWords(text string) []string {
	var words []string
	var current []rune
	for _, r := range text {
		// Define what counts as a word: letters, digits, and underscores
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' {
			current = append(current, r)
		} else {
			if len(current) >= 2 {
				words = append(words, string(current))
			}
			current = current[:0]
		}
	}
	if len(current) >= 2 {
		words = append(words, string(current))
	}
	return words
}
