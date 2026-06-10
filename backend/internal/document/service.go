package document

import (
	"context"
	"errors"
	"fmt"
	"time"

	"docstream/internal/user"
	"docstream/internal/version"

	"github.com/google/uuid"
)

// Service defines document business logic and permission enforcement.
type Service interface {
	Create(ctx context.Context, title string, ownerID string) (*Document, error)
	GetByID(ctx context.Context, id string, userID string) (*Document, error)
	List(ctx context.Context, userID string) ([]*Document, error)
	UpdateTitle(ctx context.Context, id string, title string, userID string) error
	Delete(ctx context.Context, id string, userID string) error
	Share(ctx context.Context, id string, colEmail string, role Role, userID string) error
	VerifyPermission(ctx context.Context, docID string, userID string, minRole Role) (bool, error)
	GetCollaborators(ctx context.Context, id string, userID string) ([]*Collaborator, error)
	History(ctx context.Context, docID string, userID string, from int, limit int) ([]*HistoryOp, error)
}

type service struct {
	docRepo  Repository
	userRepo user.Repository
	vService version.Service
}

// NewService instantiates a new document service.
func NewService(docRepo Repository, userRepo user.Repository, vService version.Service) Service {
	return &service{
		docRepo:  docRepo,
		userRepo: userRepo,
		vService: vService,
	}
}

func (s *service) Create(ctx context.Context, title string, ownerID string) (*Document, error) {
	if title == "" {
		return nil, errors.New("document title cannot be empty")
	}

	doc := &Document{
		ID:              uuid.New().String(),
		Title:           title,
		Content:         []byte("[]"),
		OwnerID:         ownerID,
		SnapshotVersion: 0,
		CreatedAt:       time.Now(),
		UpdatedAt:       time.Now(),
	}

	if err := s.docRepo.Create(ctx, doc); err != nil {
		return nil, err
	}
	return doc, nil
}

func (s *service) GetByID(ctx context.Context, id string, userID string) (*Document, error) {
	hasAccess, err := s.VerifyPermission(ctx, id, userID, RoleViewer)
	if err != nil {
		return nil, err
	}
	if !hasAccess {
		return nil, errors.New("forbidden: insufficient permission")
	}

	return s.docRepo.GetByID(ctx, id)
}

func (s *service) List(ctx context.Context, userID string) ([]*Document, error) {
	return s.docRepo.ListByUserID(ctx, userID)
}

func (s *service) UpdateTitle(ctx context.Context, id string, title string, userID string) error {
	if title == "" {
		return errors.New("title cannot be empty")
	}

	hasAccess, err := s.VerifyPermission(ctx, id, userID, RoleEditor)
	if err != nil {
		return err
	}
	if !hasAccess {
		return errors.New("forbidden: insufficient permission")
	}

	return s.docRepo.UpdateTitle(ctx, id, title)
}

func (s *service) Delete(ctx context.Context, id string, userID string) error {
	hasAccess, err := s.VerifyPermission(ctx, id, userID, RoleOwner)
	if err != nil {
		return err
	}
	if !hasAccess {
		return errors.New("forbidden: insufficient permission")
	}

	return s.docRepo.Delete(ctx, id)
}

func (s *service) Share(ctx context.Context, id string, colEmail string, role Role, userID string) error {
	hasAccess, err := s.VerifyPermission(ctx, id, userID, RoleEditor)
	if err != nil {
		return err
	}
	if !hasAccess {
		return errors.New("forbidden: insufficient permission")
	}

	if role == RoleOwner {
		return errors.New("cannot assign owner role via sharing")
	}

	targetUser, err := s.userRepo.GetByEmail(ctx, colEmail)
	if err != nil {
		return fmt.Errorf("user with email %s not found: %w", colEmail, err)
	}

	return s.docRepo.AddPermission(ctx, id, targetUser.ID, role)
}

func (s *service) GetCollaborators(ctx context.Context, id string, userID string) ([]*Collaborator, error) {
	hasAccess, err := s.VerifyPermission(ctx, id, userID, RoleViewer)
	if err != nil {
		return nil, err
	}
	if !hasAccess {
		return nil, errors.New("forbidden: insufficient permission")
	}

	return s.docRepo.GetCollaborators(ctx, id)
}

func (s *service) VerifyPermission(ctx context.Context, docID string, userID string, minRole Role) (bool, error) {
	role, err := s.docRepo.GetPermission(ctx, docID, userID)
	if err != nil {
		if err.Error() == "permission not found" {
			return false, nil
		}
		return false, err
	}

	roleWeight := func(r Role) int {
		switch r {
		case RoleOwner:
			return 3
		case RoleEditor:
			return 2
		case RoleViewer:
			return 1
		default:
			return 0
		}
	}

	return roleWeight(role) >= roleWeight(minRole), nil
}

type virtualChar struct {
	id        string
	afterID   string
	isDeleted bool
}

// History retrieves the operation logs for a document, replaying them to assign sequence position indices.
func (s *service) History(ctx context.Context, docID string, userID string, from int, limit int) ([]*HistoryOp, error) {
	// 1. Verify user is collaborator
	hasAccess, err := s.VerifyPermission(ctx, docID, userID, RoleViewer)
	if err != nil {
		return nil, err
	}
	if !hasAccess {
		return nil, errors.New("forbidden: insufficient permission")
	}

	// 2. Fetch full DB operation logs
	dbOps, err := s.vService.GetOpsWithUser(ctx, docID)
	if err != nil {
		return nil, fmt.Errorf("failed to load ops for document history: %w", err)
	}

	// 3. Replay logs using sequence rules to track shifts and calculate indexes
	chars := make([]*virtualChar, 0)
	history := make([]*HistoryOp, 0, len(dbOps))

	for _, op := range dbOps {
		pos := 0

		if op.OpType == "insert" {
			insertIdx := -1
			if op.AfterID != "" {
				for i, c := range chars {
					if c.id == op.AfterID {
						insertIdx = i
						break
					}
				}
				if insertIdx == -1 {
					insertIdx = len(chars) - 1
				}
			}

			// RGA forward scan
			skipped := make(map[string]bool)
			scanIdx := insertIdx + 1
			for scanIdx < len(chars) {
				curr := chars[scanIdx]
				isSibling := curr.afterID == op.AfterID
				isDescendant := skipped[curr.afterID]

				if isSibling || isDescendant {
					if isDescendant || curr.id > op.CharID {
						skipped[curr.id] = true
						scanIdx++
					} else {
						break
					}
				} else {
					break
				}
			}

			// Count non-deleted elements before scanned index
			for i := 0; i < scanIdx; i++ {
				if !chars[i].isDeleted {
					pos++
				}
			}

			// Insert character
			newChar := &virtualChar{
				id:        op.CharID,
				afterID:   op.AfterID,
				isDeleted: false,
			}
			chars = append(chars, nil)
			copy(chars[scanIdx+1:], chars[scanIdx:])
			chars[scanIdx] = newChar

		} else if op.OpType == "delete" {
			targetIdx := -1
			for i, c := range chars {
				if c.id == op.CharID {
					targetIdx = i
					break
				}
			}

			if targetIdx != -1 {
				// Count non-deleted elements before target index
				for i := 0; i < targetIdx; i++ {
					if !chars[i].isDeleted {
						pos++
					}
				}
				chars[targetIdx].isDeleted = true
			}
		}

		history = append(history, &HistoryOp{
			OpType:    op.OpType,
			Char:      op.Char,
			Position:  pos,
			UserID:    op.UserID,
			UserName:  op.Email, // User email acts as display name
			CreatedAt: op.CreatedAt,
		})
	}

	// 4. Apply pagination slicing
	total := len(history)
	if from < 0 {
		from = 0
	}
	if from >= total {
		return []*HistoryOp{}, nil
	}

	end := from + limit
	if limit <= 0 || end > total {
		end = total
	}

	return history[from:end], nil
}
