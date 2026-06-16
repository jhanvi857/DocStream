package telemetry

import (
	"context"

	"github.com/jackc/pgx/v5"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

type PGXTracer struct {
	tracer trace.Tracer
}

func NewPGXTracer() pgx.QueryTracer {
	return &PGXTracer{
		tracer: otel.Tracer("db/postgres"),
	}
}

// TraceQueryStart intercepts query execution and starts an OTel span.
func (t *PGXTracer) TraceQueryStart(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryStartData) context.Context {
	if !trace.SpanFromContext(ctx).IsRecording() {
		return ctx
	}
	ctx, _ = t.tracer.Start(ctx, "db.query",
		trace.WithSpanKind(trace.SpanKindClient),
		trace.WithAttributes(
			attribute.String("db.system", "postgresql"),
			attribute.String("db.statement", data.SQL),
		),
	)
	return ctx
}

// TraceQueryEnd ends the active database span and records any query errors.
func (t *PGXTracer) TraceQueryEnd(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryEndData) {
	span := trace.SpanFromContext(ctx)
	if data.Err != nil {
		span.RecordError(data.Err)
		span.SetAttributes(attribute.String("error", "true"))
	}
	span.End()
}
