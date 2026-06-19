package user

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository defines operations for querying and persisting user records.
type Repository interface {
	Create(ctx context.Context, u *User) error
	GetByEmail(ctx context.Context, email string) (*User, error)
	GetByID(ctx context.Context, id string) (*User, error)
	Update(ctx context.Context, u *User) error
}

type postgresRepository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a new user database repository.
func NewRepository(pool *pgxpool.Pool) Repository {
	return &postgresRepository{pool: pool}
}

func (r *postgresRepository) Create(ctx context.Context, u *User) error {
	query := `INSERT INTO users (id, email, password_hash, created_at) VALUES ($1, $2, $3, $4)`
	_, err := r.pool.Exec(ctx, query, u.ID, u.Email, u.PasswordHash, u.CreatedAt)
	if err != nil {
		return fmt.Errorf("failed to create user: %w", err)
	}
	return nil
}

func (r *postgresRepository) GetByEmail(ctx context.Context, email string) (*User, error) {
	query := `SELECT id, email, password_hash, created_at FROM users WHERE email = $1`
	var u User
	err := r.pool.QueryRow(ctx, query, email).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errors.New("user not found")
		}
		return nil, fmt.Errorf("failed to get user by email: %w", err)
	}
	return &u, nil
}

func (r *postgresRepository) GetByID(ctx context.Context, id string) (*User, error) {
	query := `SELECT id, email, password_hash, created_at FROM users WHERE id = $1`
	var u User
	err := r.pool.QueryRow(ctx, query, id).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errors.New("user not found")
		}
		return nil, fmt.Errorf("failed to get user by ID: %w", err)
	}
	return &u, nil
}

func (r *postgresRepository) Update(ctx context.Context, u *User) error {
	query := `UPDATE users SET email = $1, password_hash = $2 WHERE id = $3`
	_, err := r.pool.Exec(ctx, query, u.Email, u.PasswordHash, u.ID)
	if err != nil {
		return fmt.Errorf("failed to update user: %w", err)
	}
	return nil
}
