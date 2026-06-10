package auth

import (
	"context"
	"errors"
	"fmt"
	"time"

	"docstream/internal/user"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// define auth business logic.
type Service interface {
	Register(ctx context.Context, email, password string) (*user.User, *TokenPair, error)
	Login(ctx context.Context, email, password string) (*user.User, *TokenPair, error)
	Refresh(ctx context.Context, refreshToken string) (*TokenPair, error)
}

type service struct {
	userRepo     user.Repository
	tokenManager *TokenManager
}

func NewService(userRepo user.Repository, tokenManager *TokenManager) Service {
	return &service{
		userRepo:     userRepo,
		tokenManager: tokenManager,
	}
}

func (s *service) Register(ctx context.Context, email, password string) (*user.User, *TokenPair, error) {
	if email == "" || password == "" {
		return nil, nil, errors.New("email and password cannot be empty")
	}

	_, err := s.userRepo.GetByEmail(ctx, email)
	if err == nil {
		return nil, nil, errors.New("email already in use")
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to hash password: %w", err)
	}

	newUser := &user.User{
		ID:           uuid.New().String(),
		Email:        email,
		PasswordHash: string(hashed),
		CreatedAt:    time.Now(),
	}

	if err := s.userRepo.Create(ctx, newUser); err != nil {
		return nil, nil, err
	}

	tokens, err := s.tokenManager.GeneratePair(newUser.ID, newUser.Email)
	if err != nil {
		return nil, nil, err
	}

	return newUser, tokens, nil
}

func (s *service) Login(ctx context.Context, email, password string) (*user.User, *TokenPair, error) {
	if email == "" || password == "" {
		return nil, nil, errors.New("email and password cannot be empty")
	}

	u, err := s.userRepo.GetByEmail(ctx, email)
	if err != nil {
		return nil, nil, errors.New("invalid email or password")
	}

	// Compare hashes
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)); err != nil {
		return nil, nil, errors.New("invalid email or password")
	}

	tokens, err := s.tokenManager.GeneratePair(u.ID, u.Email)
	if err != nil {
		return nil, nil, err
	}

	return u, tokens, nil
}

func (s *service) Refresh(ctx context.Context, refreshToken string) (*TokenPair, error) {
	claims, err := s.tokenManager.ValidateRefreshToken(refreshToken)
	if err != nil {
		return nil, fmt.Errorf("invalid refresh token: %w", err)
	}

	u, err := s.userRepo.GetByID(ctx, claims.UserID)
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}

	return s.tokenManager.GeneratePair(u.ID, u.Email)
}
