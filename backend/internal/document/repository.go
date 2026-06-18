package document

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository manages database interaction for documents and permissions.
type Repository interface {
	Create(ctx context.Context, doc *Document) error
	GetByID(ctx context.Context, id string) (*Document, error)
	ListByUserID(ctx context.Context, userID string) ([]*Document, error)
	UpdateTitle(ctx context.Context, id string, title string) error
	Delete(ctx context.Context, id string) error
	AddPermission(ctx context.Context, docID string, userID string, role Role) error
	GetPermission(ctx context.Context, docID string, userID string) (Role, error)
	GetCollaborators(ctx context.Context, docID string) ([]*Collaborator, error)
	HasAccessToDocs(ctx context.Context, userID string, docIDs []string) (map[string]bool, error)
}

type postgresRepository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a new postgres document repository.
func NewRepository(pool *pgxpool.Pool) Repository {
	return &postgresRepository{pool: pool}
}

func (r *postgresRepository) Create(ctx context.Context, doc *Document) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer func() {
		_ = tx.Rollback(ctx)
	}()

	docQuery := `
		INSERT INTO documents (id, title, content, owner_id, snapshot_version, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`
	_, err = tx.Exec(ctx, docQuery, doc.ID, doc.Title, doc.Content, doc.OwnerID, doc.SnapshotVersion, doc.CreatedAt, doc.UpdatedAt)
	if err != nil {
		return fmt.Errorf("failed to insert document: %w", err)
	}

	permQuery := `
		INSERT INTO document_permissions (doc_id, user_id, role)
		VALUES ($1, $2, $3)`
	_, err = tx.Exec(ctx, permQuery, doc.ID, doc.OwnerID, string(RoleOwner))
	if err != nil {
		return fmt.Errorf("failed to insert owner permission: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}
	return nil
}

func (r *postgresRepository) GetByID(ctx context.Context, id string) (*Document, error) {
	query := `SELECT id, title, content, owner_id, snapshot_version, created_at, updated_at FROM documents WHERE id = $1`
	var doc Document
	err := r.pool.QueryRow(ctx, query, id).Scan(&doc.ID, &doc.Title, &doc.Content, &doc.OwnerID, &doc.SnapshotVersion, &doc.CreatedAt, &doc.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errors.New("document not found")
		}
		return nil, fmt.Errorf("failed to get document: %w", err)
	}
	return &doc, nil
}

func (r *postgresRepository) ListByUserID(ctx context.Context, userID string) ([]*Document, error) {
	query := `
		SELECT d.id, d.title, d.content, d.owner_id, d.snapshot_version, d.created_at, d.updated_at
		FROM documents d
		JOIN document_permissions dp ON d.id = dp.doc_id
		WHERE dp.user_id = $1
		ORDER BY d.updated_at DESC`
	rows, err := r.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to list documents: %w", err)
	}
	defer rows.Close()

	docs := make([]*Document, 0)
	for rows.Next() {
		var doc Document
		err := rows.Scan(&doc.ID, &doc.Title, &doc.Content, &doc.OwnerID, &doc.SnapshotVersion, &doc.CreatedAt, &doc.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan document: %w", err)
		}
		docs = append(docs, &doc)
	}
	return docs, nil
}

func (r *postgresRepository) UpdateTitle(ctx context.Context, id string, title string) error {
	query := `UPDATE documents SET title = $1, updated_at = $2 WHERE id = $3`
	_, err := r.pool.Exec(ctx, query, title, time.Now(), id)
	if err != nil {
		return fmt.Errorf("failed to update document title: %w", err)
	}
	return nil
}

func (r *postgresRepository) Delete(ctx context.Context, id string) error {
	query := `DELETE FROM documents WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete document: %w", err)
	}
	return nil
}

func (r *postgresRepository) AddPermission(ctx context.Context, docID string, userID string, role Role) error {
	query := `
		INSERT INTO document_permissions (doc_id, user_id, role)
		VALUES ($1, $2, $3)
		ON CONFLICT (doc_id, user_id)
		DO UPDATE SET role = EXCLUDED.role`
	_, err := r.pool.Exec(ctx, query, docID, userID, string(role))
	if err != nil {
		return fmt.Errorf("failed to add or update permission: %w", err)
	}
	return nil
}

func (r *postgresRepository) GetPermission(ctx context.Context, docID string, userID string) (Role, error) {
	query := `SELECT role FROM document_permissions WHERE doc_id = $1 AND user_id = $2`
	var role string
	err := r.pool.QueryRow(ctx, query, docID, userID).Scan(&role)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", errors.New("permission not found")
		}
		return "", fmt.Errorf("failed to get permission: %w", err)
	}
	return Role(role), nil
}

func (r *postgresRepository) GetCollaborators(ctx context.Context, docID string) ([]*Collaborator, error) {
	query := `
		SELECT dp.user_id, u.email, dp.role
		FROM document_permissions dp
		JOIN users u ON dp.user_id = u.id
		WHERE dp.doc_id = $1`
	rows, err := r.pool.Query(ctx, query, docID)
	if err != nil {
		return nil, fmt.Errorf("failed to get collaborators: %w", err)
	}
	defer rows.Close()

	collaborators := make([]*Collaborator, 0)
	for rows.Next() {
		var c Collaborator
		var roleStr string
		err := rows.Scan(&c.UserID, &c.Email, &roleStr)
		if err != nil {
			return nil, fmt.Errorf("failed to scan collaborator: %w", err)
		}
		c.Role = Role(roleStr)
		collaborators = append(collaborators, &c)
	}
	return collaborators, nil
}

func (r *postgresRepository) HasAccessToDocs(ctx context.Context, userID string, docIDs []string) (map[string]bool, error) {
	if len(docIDs) == 0 {
		return make(map[string]bool), nil
	}
	query := `
		SELECT doc_id 
		FROM document_permissions 
		WHERE user_id = $1 AND doc_id = ANY($2)`
	rows, err := r.pool.Query(ctx, query, userID, docIDs)
	if err != nil {
		return nil, fmt.Errorf("failed to check document permissions: %w", err)
	}
	defer rows.Close()

	allowed := make(map[string]bool)
	for rows.Next() {
		var docID string
		if err := rows.Scan(&docID); err != nil {
			return nil, err
		}
		allowed[docID] = true
	}
	return allowed, nil
}
