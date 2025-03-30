// controllers/locationController.go
package controllers

import (
	"CapIot.influxDB/services"
	"encoding/json"
	"net/http"
)

func GetLocations(w http.ResponseWriter, r *http.Request) {
	bucketNames, err := services.GetBuckets()
	if err != nil {
		http.Error(w, "Failed to fetch buckets", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(bucketNames); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}
