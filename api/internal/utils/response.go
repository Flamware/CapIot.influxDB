package utils

import (
	"CapIot.influxDB/internal/models"
	"encoding/json"
	"log"
	"net/http"
)

// RespondWithError sends a JSON error response using the APIError model.
// It sets the HTTP status code from the APIError and encodes the entire struct.
func RespondWithError(writer http.ResponseWriter, apiErr models.APIError) {
	// Set the HTTP status code from the APIError struct
	writer.WriteHeader(apiErr.StatusCode)
	writer.Header().Set("Content-Type", "application/json")

	// Encode the entire APIError struct to JSON
	if err := json.NewEncoder(writer).Encode(apiErr); err != nil {
		log.Printf("Failed to encode error response: %v", err)
		// Fallback for a critical encoding error
		http.Error(writer, "Failed to send error response", http.StatusInternalServerError)
	}
}

// RespondWithJSON sends a JSON success response.
func RespondWithJSON(writer http.ResponseWriter, statusCode int, payload interface{}) {
	writer.WriteHeader(statusCode)
	writer.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(writer).Encode(payload); err != nil {
		log.Printf("Failed to encode JSON response: %v", err)
		http.Error(writer, "Failed to send JSON response", http.StatusInternalServerError)
	}
}
