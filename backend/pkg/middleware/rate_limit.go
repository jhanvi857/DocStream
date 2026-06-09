package middleware

import (
	"net/http"
	"strings"
	"sync"
	"time"

	pkgErrors "docstream/pkg/errors"
)

type ipLimiter struct {
	tokens     float64
	lastRefill time.Time
}

// token bucket rate limiters per client IP.
type RateLimiter struct {
	mu         sync.Mutex
	limiters   map[string]*ipLimiter
	capacity   float64
	refillRate float64
}

func NewRateLimiter(rateLimit int, window time.Duration) *RateLimiter {
	capacity := float64(rateLimit)
	refillRate := capacity / window.Seconds()
	return &RateLimiter{
		limiters:   make(map[string]*ipLimiter),
		capacity:   capacity,
		refillRate: refillRate,
	}
}

// Middleware returns an HTTP handler wrapping the next handler in rate limiting.
func (rl *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := getIP(r)

		rl.mu.Lock()
		limiter, exists := rl.limiters[ip]
		now := time.Now()

		if !exists {
			limiter = &ipLimiter{
				tokens:     rl.capacity,
				lastRefill: now,
			}
			rl.limiters[ip] = limiter
		} else {
			// Refill tokens based on time drift
			elapsed := now.Sub(limiter.lastRefill).Seconds()
			limiter.tokens += elapsed * rl.refillRate
			if limiter.tokens > rl.capacity {
				limiter.tokens = rl.capacity
			}
			limiter.lastRefill = now
		}

		if limiter.tokens < 1.0 {
			rl.mu.Unlock()
			pkgErrors.NewAppError(http.StatusTooManyRequests, "RATE_LIMIT_EXCEEDED", "Too many requests. Please try again later.").WriteJSON(w)
			return
		}

		limiter.tokens -= 1.0
		rl.mu.Unlock()

		next.ServeHTTP(w, r)
	})
}

func getIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	ip := r.RemoteAddr
	if idx := strings.LastIndex(ip, ":"); idx != -1 {
		ip = ip[:idx]
	}
	return ip
}
