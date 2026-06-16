package telemetry

import (
	"context"
	"fmt"
	"log/slog"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

// ShutdownFunc is a function to cleanly shutdown telemetry resources on exit.
type ShutdownFunc func(context.Context) error

// InitTelemetry initializes the OTel tracer provider.
// If otlpEndpoint is empty, it initializes a no-op provider to avoid overhead.
func InitTelemetry(ctx context.Context, serviceName, env, otlpEndpoint string) (ShutdownFunc, error) {
	// Build resource representation
	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceNameKey.String(serviceName),
			semconv.DeploymentEnvironmentKey.String(env),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create OTel resource: %w", err)
	}

	var exporter sdktrace.SpanExporter
	if otlpEndpoint != "" {
		slog.Info("configuring OTel OTLP HTTP trace exporter", "endpoint", otlpEndpoint)
		// Use HTTP client for OTLP exporting
		opts := []otlptracehttp.Option{
			otlptracehttp.WithEndpoint(otlpEndpoint),
			otlptracehttp.WithInsecure(), // Standard for local/dev collector endpoints
		}
		exporter, err = otlptracehttp.New(ctx, opts...)
		if err != nil {
			return nil, fmt.Errorf("failed to create OTLP trace exporter: %w", err)
		}
	} else {
		slog.Info("no OTel OTLP endpoint configured; tracing is disabled (no-op)")
		otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))
		return func(ctx context.Context) error { return nil }, nil
	}

	bsp := sdktrace.NewBatchSpanProcessor(exporter)
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithSampler(sdktrace.AlwaysSample()), // Sample all for development/demo tracing
		sdktrace.WithResource(res),
		sdktrace.WithSpanProcessor(bsp),
	)

	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))

	shutdown := func(shutdownCtx context.Context) error {
		if err := tp.Shutdown(shutdownCtx); err != nil {
			return fmt.Errorf("failed to shutdown OTel TracerProvider: %w", err)
		}
		return nil
	}

	return shutdown, nil
}
