package version

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type OpWithUser struct {
	OpType    string    `json:"op_type"`
	CharID    string    `json:"char_id"`
	Char      string    `json:"char"`
	AfterID   string    `json:"after_id"`
	IsDeleted bool      `json:"is_deleted"`
	UserID    string    `json:"user_id"`
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"created_at"`
}

// manage db interaction for operations and snapshots.
type Repository interface {
	SaveOp(ctx context.Context, op *Op) error
	GetOpsSince(ctx context.Context, docID string, since time.Time) ([]*Op, error)
	GetOpsCountSince(ctx context.Context, docID string, since time.Time) (int, error)
	GetLatestSnapshot(ctx context.Context, docID string) (json.RawMessage, int, time.Time, error)
	SaveSnapshot(ctx context.Context, docID string, content json.RawMessage, version int) error
	GetOpsAfter(ctx context.Context, docID string, offset int) ([]*Op, error)
	GetTotalOpsCount(ctx context.Context, docID string) (int, error)
	GetOpsWithUser(ctx context.Context, docID string) ([]*OpWithUser, error)
}

type postgresRepository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) Repository {
	return &postgresRepository{pool: pool}
}

func (r *postgresRepository) SaveOp(ctx context.Context, op *Op) error {
	query := `
		INSERT INTO ops_log (id, doc_id, user_id, op_type, char_id, char, after_id, is_deleted, vector_clock, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`
	_, err := r.pool.Exec(ctx, query,
		op.ID, op.DocID, op.UserID, op.OpType, op.CharID, op.Char, op.AfterID, op.IsDeleted, op.VectorClock, op.CreatedAt)
	if err != nil {
		return fmt.Errorf("failed to save op: %w", err)
	}
	return nil
}

func (r *postgresRepository) GetOpsSince(ctx context.Context, docID string, since time.Time) ([]*Op, error) {
	query := `
		SELECT id, doc_id, user_id, op_type, char_id, char, after_id, is_deleted, vector_clock, created_at
		FROM ops_log
		WHERE doc_id = $1 AND created_at > $2
		ORDER BY created_at ASC`
	rows, err := r.pool.Query(ctx, query, docID, since)
	if err != nil {
		return nil, fmt.Errorf("failed to query ops: %w", err)
	}
	defer rows.Close()

	ops := make([]*Op, 0)
	for rows.Next() {
		var op Op
		err := rows.Scan(
			&op.ID, &op.DocID, &op.UserID, &op.OpType, &op.CharID, &op.Char, &op.AfterID, &op.IsDeleted, &op.VectorClock, &op.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan op: %w", err)
		}
		ops = append(ops, &op)
	}
	return ops, nil
}

func (r *postgresRepository) GetOpsCountSince(ctx context.Context, docID string, since time.Time) (int, error) {
	query := `SELECT COUNT(*) FROM ops_log WHERE doc_id = $1 AND created_at > $2`
	var count int
	err := r.pool.QueryRow(ctx, query, docID, since).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count ops: %w", err)
	}
	return count, nil
}

func (r *postgresRepository) GetLatestSnapshot(ctx context.Context, docID string) (json.RawMessage, int, time.Time, error) {
	query := `SELECT content, snapshot_version, updated_at FROM documents WHERE id = $1`
	var content json.RawMessage
	var version int
	var updatedAt time.Time
	err := r.pool.QueryRow(ctx, query, docID).Scan(&content, &version, &updatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, 0, time.Time{}, errors.New("document not found")
		}
		return nil, 0, time.Time{}, fmt.Errorf("failed to get snapshot: %w", err)
	}
	return content, version, updatedAt, nil
}

func (r *postgresRepository) SaveSnapshot(ctx context.Context, docID string, content json.RawMessage, version int) error {
	query := `UPDATE documents SET content = $1, snapshot_version = $2, updated_at = $3 WHERE id = $4`
	_, err := r.pool.Exec(ctx, query, content, version, time.Now(), docID)
	if err != nil {
		return fmt.Errorf("failed to save snapshot: %w", err)
	}
	return nil
}

func (r *postgresRepository) GetOpsAfter(ctx context.Context, docID string, offset int) ([]*Op, error) {
	query := `
		SELECT id, doc_id, user_id, op_type, char_id, char, after_id, is_deleted, vector_clock, created_at
		FROM ops_log
		WHERE doc_id = $1
		ORDER BY created_at ASC
		OFFSET $2`
	rows, err := r.pool.Query(ctx, query, docID, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to query ops after offset: %w", err)
	}
	defer rows.Close()

	ops := make([]*Op, 0)
	for rows.Next() {
		var op Op
		err := rows.Scan(
			&op.ID, &op.DocID, &op.UserID, &op.OpType, &op.CharID, &op.Char, &op.AfterID, &op.IsDeleted, &op.VectorClock, &op.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan op: %w", err)
		}
		ops = append(ops, &op)
	}
	return ops, nil
}

func (r *postgresRepository) GetTotalOpsCount(ctx context.Context, docID string) (int, error) {
	query := `SELECT COUNT(*) FROM ops_log WHERE doc_id = $1`
	var count int
	err := r.pool.QueryRow(ctx, query, docID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count total ops: %w", err)
	}
	return count, nil
}

func (r *postgresRepository) GetOpsWithUser(ctx context.Context, docID string) ([]*OpWithUser, error) {
	query := `
		SELECT o.op_type, o.char_id, o.char, o.after_id, o.is_deleted, o.user_id, u.email, o.created_at
		FROM ops_log o
		JOIN users u ON o.user_id = u.id
		WHERE o.doc_id = $1
		ORDER BY o.created_at ASC`
	rows, err := r.pool.Query(ctx, query, docID)
	if err != nil {
		return nil, fmt.Errorf("failed to query ops with user details: %w", err)
	}
	defer rows.Close()

	ops := make([]*OpWithUser, 0)
	for rows.Next() {
		var op OpWithUser
		err := rows.Scan(
			&op.OpType, &op.CharID, &op.Char, &op.AfterID, &op.IsDeleted, &op.UserID, &op.Email, &op.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan op with user: %w", err)
		}
		ops = append(ops, &op)
	}
	return ops, nil
}
