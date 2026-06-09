package logger

import (
	"log/slog"
	"os"
)

// Setup initializes the global slog structured logger.
// It uses a JSON handler and sets the appropriate log level based on the environment.
func Setup(env string) {
	var level slog.Level
	if env == "development" {
		level = slog.LevelDebug
	} else {
		level = slog.LevelInfo
	}

	opts := &slog.HandlerOptions{
		Level: level,
	}

	handler := slog.NewJSONHandler(os.Stdout, opts)
	logger := slog.New(handler)
	slog.SetDefault(logger)
}
