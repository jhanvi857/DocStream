package middleware

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"
)

// OTelMiddleware is a chi-compatible middleware to trace incoming HTTP requests.
func OTelMiddleware(serviceName string) func(http.Handler) http.Handler {
	tracer := otel.Tracer("http-server")
	propagator := otel.GetTextMapPropagator()

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Extract context from incoming HTTP headers
			ctx := propagator.Extract(r.Context(), propagation.HeaderCarrier(r.Header))

			// Initial span name fallback
			spanName := r.Method + " " + r.URL.Path

			ctx, span := tracer.Start(ctx, spanName,
				trace.WithSpanKind(trace.SpanKindServer),
				trace.WithAttributes(
					attribute.String("http.method", r.Method),
					attribute.String("http.target", r.URL.Path),
					attribute.String("http.host", r.Host),
					attribute.String("http.user_agent", r.UserAgent()),
				),
			)
			defer span.End()

			// Wrap response writer to capture status code & size
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)

			// Execute handlers
			next.ServeHTTP(ww, r.WithContext(ctx))

			// Refine span name with chi route pattern if matched
			rctx := chi.RouteContext(r.Context())
			if rctx != nil {
				routePattern := rctx.RoutePattern()
				if routePattern != "" {
					span.SetName(r.Method + " " + routePattern)
					span.SetAttributes(attribute.String("http.route", routePattern))
				}
			}

			// Record response status & byte size
			span.SetAttributes(
				attribute.Int("http.status_code", ww.Status()),
				attribute.Int("http.response_content_length", ww.BytesWritten()),
			)

			if ww.Status() >= 500 {
				span.SetAttributes(attribute.String("error", "true"))
			}
		})
	}
}
