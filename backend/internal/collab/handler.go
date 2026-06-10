package collab

import (
	"log/slog"
	"net/http"

	"docstream/internal/auth"
	"docstream/internal/document"
	pkgErrors "docstream/pkg/errors"

	"github.com/go-chi/chi/v5"
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

	// 1. Authenticate query parameter token
	tokenStr := r.URL.Query().Get("token")
	if tokenStr == "" {
		pkgErrors.NewUnauthorizedError("missing token query parameter").WriteJSON(w)
		return
	}

	claims, err := h.tokenManager.ValidateAccessToken(tokenStr)
	if err != nil {
		pkgErrors.NewUnauthorizedError("invalid or expired token").WriteJSON(w)
		return
	}

	// 2. Validate document access permissions (must be viewer or above)
	hasAccess, err := h.docService.VerifyPermission(r.Context(), docID, claims.UserID, document.RoleViewer)
	if err != nil {
		pkgErrors.NewInternalError(err.Error()).WriteJSON(w)
		return
	}
	if !hasAccess {
		pkgErrors.NewForbiddenError("insufficient permissions to join document session").WriteJSON(w)
		return
	}

	// 3. Upgrade HTTP connection
	opts := &websocket.AcceptOptions{
		InsecureSkipVerify: true, // Configured for flexible dev/prod proxying
	}

	conn, err := websocket.Accept(w, r, opts)
	if err != nil {
		slog.Error("websocket upgrade accept failed", "error", err, "docID", docID, "userID", claims.UserID)
		return
	}

	// 4. Instantiate and register the Client
	client := NewClient(claims.UserID, docID, conn, h.hub)
	h.hub.register <- client

	// 5. Spin up reader/writer routines
	ctx := r.Context()
	go client.WritePump(ctx)
	client.ReadPump(ctx)
}
