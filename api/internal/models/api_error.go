package models

import "fmt"

// ErrorCode is a string type for consistent error codes.
type ErrorCode string

// Predefined error codes for common API errors.
const (
	// Generic
	ErrorCodeInternalServerError ErrorCode = "internal_server_error"
	ErrorCodeBadRequest          ErrorCode = "bad_request"
	ErrorCodeNotFound            ErrorCode = "not_found"
	ErrorCodeForbidden           ErrorCode = "forbidden"
	ErrorCodeUnauthorized        ErrorCode = "unauthorized"
	ErrorCodeMethodNotAllowed    ErrorCode = "method_not_allowed"
	// Authentication & Authorization
	ErrorCodeInvalidToken            ErrorCode = "invalid_token"
	ErrorCodeTokenExpired            ErrorCode = "token_expired"
	ErrorCodeInsufficientPermissions ErrorCode = "insufficient_permissions"

	// Validation
	ErrorCodeValidationFailed     ErrorCode = "validation_failed"
	ErrorCodeMissingParameter     ErrorCode = "missing_parameter"
	ErrorCodeInvalidFormat        ErrorCode = "invalid_format"
	ErrorCodeUnsupportedMediaType ErrorCode = "unsupported_media_type"

	// Resource Specific
	ErrorCodeResourceNotFound  ErrorCode = "resource_not_found"
	ErrorCodeDuplicateResource ErrorCode = "duplicate_resource"
)

type APIError struct {
	Code       ErrorCode `json:"code"`              // Use the new ErrorCode type
	Message    string    `json:"message"`           // Human-readable error message
	Details    any       `json:"details,omitempty"` // Optional: Additional details
	StatusCode int       `json:"-"`                 // HTTP status code
}

// Error makes APIError implement the error interface.
func (e APIError) Error() string {
	return fmt.Sprintf("[%s] %s", e.Code, e.Message)
}

// NewAPIError is a constructor for APIError.
func NewAPIError(code ErrorCode, message string, details any, statusCode int) APIError {
	return APIError{
		Code:       code,
		Message:    message,
		Details:    details,
		StatusCode: statusCode,
	}
}
