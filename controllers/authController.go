package controllers

import (
	"CapIot.influxDB/config"
	"encoding/json"
	"github.com/gorilla/mux"
	"log"
	"net/http"
	"time"
)

// PublicKeyRequest represents the request body for storing the public key
type PublicKeyRequest struct {
	PublicKey string `json:"publicKey"` // The public key of the device
}

// StoreTPM2PublicKey handles storing the TPM2 public key in Redis
func StoreTPM2PublicKey(w http.ResponseWriter, r *http.Request) {
	// Extract device ID from the URL variables
	vars := mux.Vars(r)
	deviceID := vars["device_id"]

	// Decode the request body to get the public key
	var req PublicKeyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("Failed to decode request body for device %s: %v", deviceID, err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Set a TTL for the public key (e.g., 24 hours)
	ttl := time.Hour * 24

	// Store the public key in Redis
	err := config.StorePublicKey(deviceID, req.PublicKey, ttl)
	if err != nil {
		log.Printf("Error storing public key for device %s: %v", deviceID, err)
		http.Error(w, "Failed to store public key", http.StatusInternalServerError)
		return
	}

	// Log successful creation in Redis
	log.Printf("Public key stored successfully for device %s with TTL %v", deviceID, ttl)

	// Respond with success
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Public key stored successfully"))
}
