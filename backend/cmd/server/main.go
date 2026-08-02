package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"docstream/internal/auth"
	"docstream/internal/collab"
	"docstream/internal/document"
	"docstream/internal/typeahead"
	"docstream/internal/user"
	"docstream/internal/version"
	"docstream/pkg/config"
	"docstream/pkg/db"
	"docstream/pkg/logger"
	pkgMiddleware "docstream/pkg/middleware"
	"docstream/pkg/telemetry"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
)

func main() {
	// Load environment configurations
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to load config: %v\n", err)
		os.Exit(1)
	}

	// Initialize OpenTelemetry
	otelShutdown, err := telemetry.InitTelemetry(context.Background(), cfg.ServiceName, cfg.Env, cfg.OtelEndpoint)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to initialize OpenTelemetry: %v\n", err)
		os.Exit(1)
	}
	defer func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := otelShutdown(shutdownCtx); err != nil {
			fmt.Fprintf(os.Stderr, "failed to shutdown OpenTelemetry: %v\n", err)
		}
	}()

	// Initialize slog JSON logger
	logger.Setup(cfg.Env)
	slog.Info("logger initialized", "env", cfg.Env)

	// Generate a unique instance ID for this server node
	instanceID := uuid.New().String()
	slog.Info("server instance initialized", "instanceID", instanceID)

	// Connect to Postgres
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pgDB, err := db.ConnectPostgres(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("failed to connect to PostgreSQL", "error", err)
		os.Exit(1)
	}
	defer pgDB.Close()
	slog.Info("connected to PostgreSQL")

	// Run SQL migrations automatically
	err = pgDB.RunMigrations(ctx, "migrations")
	if err != nil {
		slog.Error("failed to run database migrations", "error", err)
		os.Exit(1)
	}
	slog.Info("database migrations completed")

	// Connect to Redis
	redisClient, err := db.ConnectRedis(ctx, cfg.RedisURL)
	if err != nil {
		slog.Error("failed to connect to Redis", "error", err)
		os.Exit(1)
	}
	defer func() {
		if err := redisClient.Close(); err != nil {
			slog.Error("failed to close Redis client", "error", err)
		}
	}()
	slog.Info("connected to Redis")

	// Setup Services, Repositories, Handlers
	userRepo := user.NewRepository(pgDB.Pool)
	docRepo := document.NewRepository(pgDB.Pool)
	versionRepo := version.NewRepository(pgDB.Pool)

	tokenManager := auth.NewTokenManager(cfg.JWTSecret, cfg.JWTRefreshSecret)

	// Initialize loader callback for typeahead mentions (avoids circular imports)
	loader := func(ctx context.Context, docID string) ([]string, error) {
		collabs, err := docRepo.GetCollaborators(ctx, docID)
		if err != nil {
			return nil, err
		}
		emails := make([]string, len(collabs))
		for i, c := range collabs {
			emails[i] = c.Email
		}
		return emails, nil
	}

	// Initialize Typeahead/Autocomplete service
	typeaheadService, err := typeahead.NewService("./data/typeahead", loader)
	if err != nil {
		slog.Error("failed to initialize typeahead service", "error", err)
		os.Exit(1)
	}

	authService := auth.NewService(userRepo, tokenManager)
	versionService := version.NewService(versionRepo)
	docService := document.NewService(
		docRepo,
		userRepo,
		versionService,
		// onCreate hook (index doc titles)
		func(docID string, title string) {
			typeaheadService.InsertTitle(docID, title)
		},
		// onShare hook (index new collaborator email)
		func(ctx context.Context, docID string, email string) {
			_ = typeaheadService.InsertCollaborator(ctx, docID, email)
		},
	)

	// Setup Redis Pub/Sub for multi-instance scaling
	pubSub := collab.NewRedisPubSub(redisClient.Client, instanceID)

	// Instantiate Collaboration Hub with Version service and Redis Pub/Sub
	hub := collab.NewHub(versionService, pubSub, docService, tokenManager)
	go hub.Run()

	authHandler := auth.NewHandler(authService)
	docHandler := document.NewHandler(docService)
	wsHandler := collab.NewHandler(hub, docService, tokenManager, cfg.AllowedOrigin)
	typeaheadHandler := typeahead.NewHandler(typeaheadService, docService, hub)

	// Initialize rate limiter (100 requests per 1 minute)
	rateLimiter := pkgMiddleware.NewRateLimiter(100, 1*time.Minute)

	// Initialize router
	r := chi.NewRouter()

	// Default middlewares
	r.Use(pkgMiddleware.OTelMiddleware(cfg.ServiceName))
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	// Hardening middlewares
	r.Use(pkgMiddleware.CORS(cfg.AllowedOrigin))
	r.Use(rateLimiter.Middleware)

	// Health check endpoint
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		dbPingErr := pgDB.Ping(r.Context())
		redisPingErr := redisClient.Ping(r.Context())

		status := "ok"
		statusCode := http.StatusOK
		dbStatus := "ok"
		redisStatus := "ok"

		if dbPingErr != nil {
			status = "unhealthy"
			dbStatus = dbPingErr.Error()
			statusCode = http.StatusInternalServerError
		}
		if redisPingErr != nil {
			status = "unhealthy"
			redisStatus = redisPingErr.Error()
			statusCode = http.StatusInternalServerError
		}

		w.WriteHeader(statusCode)
		_, _ = fmt.Fprintf(w, `{"status":"%s","db":"%s","redis":"%s"}`, status, dbStatus, redisStatus)
	})

	// Auth routes (unprotected)
	r.Post("/auth/register", authHandler.Register)
	r.Post("/auth/login", authHandler.Login)
	r.Post("/auth/refresh", authHandler.Refresh)

	// Document REST routes (protected by AuthMiddleware)
	r.Group(func(r chi.Router) {
		r.Use(auth.AuthMiddleware(tokenManager))

		r.Get("/documents", docHandler.List)
		r.Post("/documents", docHandler.Create)
		r.Delete("/documents/{id}", docHandler.Delete)
		r.Post("/documents/{id}/share", docHandler.Share)
		r.Post("/documents/{id}/share/public", docHandler.SharePublic)

		// Typeahead/Autocomplete routes
		r.Get("/suggest/titles", typeaheadHandler.SuggestTitles)
		r.Get("/documents/{id}/mentions/suggest", typeaheadHandler.SuggestMentions)
		r.Post("/documents/{id}/mentions/select", typeaheadHandler.SelectMention)
	})

	// Document REST routes (using OptionalAuthMiddleware to support guest access for public sharing)
	r.Group(func(r chi.Router) {
		r.Use(auth.OptionalAuthMiddleware(tokenManager))

		r.Get("/documents/{id}", docHandler.Get)
		r.Patch("/documents/{id}", docHandler.Update)
		r.Get("/documents/{id}/history", docHandler.History)
		r.Get("/documents/{id}/suggest", typeaheadHandler.SuggestWords)
	})

	// WebSocket upgrade endpoint (validates token inside query parameters)
	r.Get("/ws/document/{id}", wsHandler.ServeWS)

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	slog.Info("server starting", "port", cfg.Port)

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server failed to start", "error", err)
			os.Exit(1)
		}
	}()

	// Listen for interrupt signal to gracefully shut down
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("shutting down server...")

	// Create shutdown context with 5s timeout
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	// Shut down HTTP server first to stop receiving new requests
	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("server forced to shutdown", "error", err)
	}

	// Close typeahead service to flush WAL/snapshot to disk
	slog.Info("closing typeahead service...")
	if err := typeaheadService.Close(); err != nil {
		slog.Error("failed to close typeahead service gracefully", "error", err)
	}

	slog.Info("server exited gracefully")
}
