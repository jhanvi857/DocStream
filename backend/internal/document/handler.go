package document

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"docstream/internal/auth"
	pkgErrors "docstream/pkg/errors"

	"github.com/go-chi/chi/v5"
)

// Handler serves HTTP endpoints for document resources.
type Handler struct {
	docService Service
}

// NewHandler instantiates a document Handler.
func NewHandler(docService Service) *Handler {
	return &Handler{docService: docService}
}

type createRequest struct {
	Title string `json:"title"`
}

type updateRequest struct {
	Title string `json:"title"`
}

type shareRequest struct {
	Email string `json:"email"`
	Role  Role   `json:"role"`
}

// List returns all documents a user owns or collaborates on.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		pkgErrors.NewUnauthorizedError("unauthorized").WriteJSON(w)
		return
	}

	docs, err := h.docService.List(r.Context(), userID)
	if err != nil {
		pkgErrors.NewInternalError(err.Error()).WriteJSON(w)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(docs)
}

// Create generates a new document with the current user as owner.
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		pkgErrors.NewUnauthorizedError("unauthorized").WriteJSON(w)
		return
	}

	var req createRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		pkgErrors.NewValidationError("invalid request body").WriteJSON(w)
		return
	}

	doc, err := h.docService.Create(r.Context(), req.Title, userID)
	if err != nil {
		pkgErrors.NewValidationError(err.Error()).WriteJSON(w)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(doc)
}

// Get fetches document details, verifying the user is a collaborator.
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		pkgErrors.NewUnauthorizedError("unauthorized").WriteJSON(w)
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		pkgErrors.NewValidationError("missing document id").WriteJSON(w)
		return
	}

	doc, err := h.docService.GetByID(r.Context(), id, userID)
	if err != nil {
		if strings.Contains(err.Error(), "forbidden") {
			pkgErrors.NewForbiddenError(err.Error()).WriteJSON(w)
			return
		}
		if strings.Contains(err.Error(), "not found") {
			pkgErrors.NewNotFoundError(err.Error()).WriteJSON(w)
			return
		}
		pkgErrors.NewInternalError(err.Error()).WriteJSON(w)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(doc)
}

// Update renames a document's title. Requires editor/owner permission.
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		pkgErrors.NewUnauthorizedError("unauthorized").WriteJSON(w)
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		pkgErrors.NewValidationError("missing document id").WriteJSON(w)
		return
	}

	var req updateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		pkgErrors.NewValidationError("invalid request body").WriteJSON(w)
		return
	}

	err := h.docService.UpdateTitle(r.Context(), id, req.Title, userID)
	if err != nil {
		if strings.Contains(err.Error(), "forbidden") {
			pkgErrors.NewForbiddenError(err.Error()).WriteJSON(w)
			return
		}
		pkgErrors.NewValidationError(err.Error()).WriteJSON(w)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "document title updated successfully"})
}

// Delete removes a document. Requires owner permission.
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		pkgErrors.NewUnauthorizedError("unauthorized").WriteJSON(w)
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		pkgErrors.NewValidationError("missing document id").WriteJSON(w)
		return
	}

	err := h.docService.Delete(r.Context(), id, userID)
	if err != nil {
		if strings.Contains(err.Error(), "forbidden") {
			pkgErrors.NewForbiddenError(err.Error()).WriteJSON(w)
			return
		}
		pkgErrors.NewValidationError(err.Error()).WriteJSON(w)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "document deleted successfully"})
}

// Share registers an editor or viewer permission for a target user.
func (h *Handler) Share(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		pkgErrors.NewUnauthorizedError("unauthorized").WriteJSON(w)
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		pkgErrors.NewValidationError("missing document id").WriteJSON(w)
		return
	}

	var req shareRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		pkgErrors.NewValidationError("invalid request body").WriteJSON(w)
		return
	}

	if req.Role != RoleEditor && req.Role != RoleViewer {
		pkgErrors.NewValidationError("role must be 'editor' or 'viewer'").WriteJSON(w)
		return
	}

	err := h.docService.Share(r.Context(), id, req.Email, req.Role, userID)
	if err != nil {
		if strings.Contains(err.Error(), "forbidden") {
			pkgErrors.NewForbiddenError(err.Error()).WriteJSON(w)
			return
		}
		if strings.Contains(err.Error(), "not found") {
			pkgErrors.NewNotFoundError(err.Error()).WriteJSON(w)
			return
		}
		pkgErrors.NewValidationError(err.Error()).WriteJSON(w)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "document shared successfully"})
}

// History retrieves the chronological operation log for a document.
func (h *Handler) History(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		pkgErrors.NewUnauthorizedError("unauthorized").WriteJSON(w)
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		pkgErrors.NewValidationError("missing document id").WriteJSON(w)
		return
	}

	// 1. Read pagination query parameters with safe defaults
	from := 0
	limit := 50

	if fromStr := r.URL.Query().Get("from"); fromStr != "" {
		if val, err := strconv.Atoi(fromStr); err == nil && val >= 0 {
			from = val
		}
	}
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if val, err := strconv.Atoi(limitStr); err == nil && val > 0 {
			limit = val
		}
	}

	// 2. Fetch replayed operation history
	history, err := h.docService.History(r.Context(), id, userID, from, limit)
	if err != nil {
		if strings.Contains(err.Error(), "forbidden") {
			pkgErrors.NewForbiddenError(err.Error()).WriteJSON(w)
			return
		}
		pkgErrors.NewInternalError(err.Error()).WriteJSON(w)
		return
	}

	// 3. Respond with JSON payload
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(history)
}
