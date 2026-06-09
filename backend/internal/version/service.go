package version

import (
	"context"
	"encoding/json"
)

// methods for managing document version history and snapshots.
type Service interface {
	PersistOp(ctx context.Context, op *Op) (bool, error)
	LoadDocumentState(ctx context.Context, docID string) (json.RawMessage, []*Op, int, error)
	SaveSnapshot(ctx context.Context, docID string, content json.RawMessage, version int) error
	GetOpsAfter(ctx context.Context, docID string, offset int) ([]*Op, error)
	GetTotalOpsCount(ctx context.Context, docID string) (int, error)
	GetOpsWithUser(ctx context.Context, docID string) ([]*OpWithUser, error)
}

type service struct {
	repo Repository
}

func NewService(repo Repository) Service {
	return &service{repo: repo}
}

func (s *service) PersistOp(ctx context.Context, op *Op) (bool, error) {
	if err := s.repo.SaveOp(ctx, op); err != nil {
		return false, err
	}

	_, _, updatedAt, err := s.repo.GetLatestSnapshot(ctx, op.DocID)
	if err != nil {
		return false, err
	}

	count, err := s.repo.GetOpsCountSince(ctx, op.DocID, updatedAt)
	if err != nil {
		return false, err
	}

	return count >= 100, nil
}

// return the current snapshot payload along with all subsequent incremental operations.
func (s *service) LoadDocumentState(ctx context.Context, docID string) (json.RawMessage, []*Op, int, error) {
	content, version, updatedAt, err := s.repo.GetLatestSnapshot(ctx, docID)
	if err != nil {
		return nil, nil, 0, err
	}

	ops, err := s.repo.GetOpsSince(ctx, docID, updatedAt)
	if err != nil {
		return nil, nil, 0, err
	}

	return content, ops, version, nil
}

func (s *service) SaveSnapshot(ctx context.Context, docID string, content json.RawMessage, version int) error {
	return s.repo.SaveSnapshot(ctx, docID, content, version)
}

func (s *service) GetOpsAfter(ctx context.Context, docID string, offset int) ([]*Op, error) {
	return s.repo.GetOpsAfter(ctx, docID, offset)
}

func (s *service) GetTotalOpsCount(ctx context.Context, docID string) (int, error) {
	return s.repo.GetTotalOpsCount(ctx, docID)
}

func (s *service) GetOpsWithUser(ctx context.Context, docID string) ([]*OpWithUser, error) {
	return s.repo.GetOpsWithUser(ctx, docID)
}
