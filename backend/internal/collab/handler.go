package collab

import (
	"log/slog"
	"net/http"

	"docstream/internal/auth"
	"docstream/internal/document"
	pkgErrors "docstream/pkg/errors"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"nhooyr.io/websocket"
)

// Handler serves websocket upgrade requests.
type Handler struct {
	hub          *Hub
	docService   document.Service
	tokenManager *auth.TokenManager
}

// NewHandler instantiates a WS Handler.
func NewHandler(hub *Hub, docService document.Service, tokenManager *auth.TokenManager) *Handler {
	return &Handler{
		hub:          hub,
		docService:   docService,
		tokenManager: tokenManager,
	}
}

// ServeWS authenticates token parameters, validates document membership, upgrades to websocket, and registers client to Hub.
func (h *Handler) ServeWS(w http.ResponseWriter, r *http.Request) {
	docID := chi.URLParam(r, "id")
	if docID == "" {
		pkgErrors.NewValidationError("missing document id").WriteJSON(w)
		return
	}

	// 1. Authenticate query parameter token (optional for public documents)
	var userID string
	tokenStr := r.URL.Query().Get("token")
	if tokenStr != "" {
		claims, err := h.tokenManager.ValidateAccessToken(tokenStr)
		if err == nil {
			userID = claims.UserID
		}
	}

	// 2. Validate document access permissions (must be viewer or above)
	hasAccess, err := h.docService.VerifyPermission(r.Context(), docID, userID, document.RoleViewer)
	if err != nil {
		pkgErrors.NewInternalError(err.Error()).WriteJSON(w)
		return
	}
	if !hasAccess {
		pkgErrors.NewForbiddenError("insufficient permissions to join document session").WriteJSON(w)
		return
	}

	// Retrieve client's role on the document
	role, err := h.docService.GetRole(r.Context(), docID, userID)
	if err != nil {
		pkgErrors.NewForbiddenError(err.Error()).WriteJSON(w)
		return
	}

	// If guest, assign a random guest ID
	if userID == "" {
		userID = "guest-" + uuid.New().String()[:8]
	}

	// 3. Upgrade HTTP connection
	opts := &websocket.AcceptOptions{
		InsecureSkipVerify: true, // Configured for flexible dev/prod proxying
	}

	conn, err := websocket.Accept(w, r, opts)
	if err != nil {
		slog.Error("websocket upgrade accept failed", "error", err, "docID", docID, "userID", userID)
		return
	}

	// 4. Instantiate and register the Client
	client := NewClient(userID, docID, role, conn, h.hub)
	h.hub.register <- client

	// 5. Spin up reader/writer routines
	ctx := r.Context()
	go client.WritePump(ctx)
	client.ReadPump(ctx)
}
