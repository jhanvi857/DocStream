package auth

import (
	"context"
	"net/http"
	"strings"

	pkgErrors "docstream/pkg/errors"
)

type contextKey string

const (
	UserIDKey contextKey = "userID"
	EmailKey  contextKey = "email"
)

func AuthMiddleware(tm *TokenManager) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				pkgErrors.NewUnauthorizedError("missing authorization header").WriteJSON(w)
				return
			}

			parts := strings.Split(authHeader, " ")
			if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
				pkgErrors.NewUnauthorizedError("invalid authorization header format").WriteJSON(w)
				return
			}

			tokenStr := parts[1]
			claims, err := tm.ValidateAccessToken(tokenStr)
			if err != nil {
				pkgErrors.NewUnauthorizedError("invalid or expired access token").WriteJSON(w)
				return
			}

			ctx := context.WithValue(r.Context(), UserIDKey, claims.UserID)
			ctx = context.WithValue(ctx, EmailKey, claims.Email)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func GetUserIDFromContext(ctx context.Context) (string, bool) {
	val, ok := ctx.Value(UserIDKey).(string)
	return val, ok
}
