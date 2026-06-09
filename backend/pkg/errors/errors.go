package errors

import (
	"encoding/json"
	"net/http"
)

// ErrorCode is a string representation of specific error categories.
type ErrorCode string

const (
	ErrCodeValidation   ErrorCode = "VALIDATION_ERROR"
	ErrCodeUnauthorized ErrorCode = "UNAUTHORIZED"
	ErrCodeForbidden    ErrorCode = "FORBIDDEN"
	ErrCodeNotFound     ErrorCode = "NOT_FOUND"
	ErrCodeConflict     ErrorCode = "CONFLICT"
	ErrCodeInternal     ErrorCode = "INTERNAL_ERROR"
	ErrCodeBadRequest   ErrorCode = "BAD_REQUEST"
)

type AppError struct {
	Code    ErrorCode `json:"code"`
	Message string    `json:"message"`
	Status  int       `json:"-"`
}

func (e *AppError) Error() string {
	return e.Message
}

// instantiate a custom AppError.
func NewAppError(status int, code ErrorCode, message string) *AppError {
	return &AppError{
		Code:    code,
		Message: message,
		Status:  status,
	}
}

// serialize the error under the {"error": {"code": "...", "message": "..."}} format.
func (e *AppError) WriteJSON(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(e.Status)

	type errorResponse struct {
		Error *AppError `json:"error"`
	}
	_ = json.NewEncoder(w).Encode(errorResponse{Error: e})
}

func NewValidationError(msg string) *AppError {
	return NewAppError(http.StatusBadRequest, ErrCodeValidation, msg)
}

func NewUnauthorizedError(msg string) *AppError {
	return NewAppError(http.StatusUnauthorized, ErrCodeUnauthorized, msg)
}

func NewForbiddenError(msg string) *AppError {
	return NewAppError(http.StatusForbidden, ErrCodeForbidden, msg)
}

func NewNotFoundError(msg string) *AppError {
	return NewAppError(http.StatusNotFound, ErrCodeNotFound, msg)
}

func NewConflictError(msg string) *AppError {
	return NewAppError(http.StatusConflict, ErrCodeConflict, msg)
}

func NewInternalError(msg string) *AppError {
	return NewAppError(http.StatusInternalServerError, ErrCodeInternal, msg)
}

func NewBadRequestError(msg string) *AppError {
	return NewAppError(http.StatusBadRequest, ErrCodeBadRequest, msg)
}
