package config

import (
	"fmt"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	Port             string
	Env              string
	DatabaseURL      string
	RedisURL         string
	JWTSecret        string
	JWTRefreshSecret string
	AllowedOrigin    string
}

func Load() (*Config, error) {
	_ = godotenv.Overload()

	port := getEnv("PORT", "8080")
	env := getEnv("ENV", "development")
	dbURL := os.Getenv("DATABASE_URL")
	redisURL := getEnv("REDIS_URL", "redis://localhost:6379/0")
	jwtSec := os.Getenv("JWT_SECRET")
	jwtRefSec := os.Getenv("JWT_REFRESH_SECRET")
	allowedOrigin := getEnv("ALLOWED_ORIGIN", "*")

	// Validate required variables
	if dbURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if jwtSec == "" {
		return nil, fmt.Errorf("JWT_SECRET is required")
	}
	if jwtRefSec == "" {
		return nil, fmt.Errorf("JWT_REFRESH_SECRET is required")
	}

	return &Config{
		Port:             port,
		Env:              env,
		DatabaseURL:      dbURL,
		RedisURL:         redisURL,
		JWTSecret:        jwtSec,
		JWTRefreshSecret: jwtRefSec,
		AllowedOrigin:    allowedOrigin,
	}, nil
}

func getEnv(key, defaultVal string) string {
	if val, ok := os.LookupEnv(key); ok {
		return val
	}
	return defaultVal
}
