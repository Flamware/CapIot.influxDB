package handlers

import (
	"CapIot.influxDB/services"
	"fmt"
	"github.com/gorilla/mux"
	"net/http"
)

// GetDevices extracts location_id from URL params and processes the request
func GetDevices(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	locationID := vars["location_id"]

	if locationID == "" {
		http.Error(w, "location_id is required", http.StatusBadRequest)
		return
	}

	// Call service layer
	err, _ := services.GetDevices(locationID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Error retrieving devices: %v", err), http.StatusInternalServerError)
		return
	}

	// Success response
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(fmt.Sprintf("✅ Devices retrieved successfully for location ID: %s", locationID)))
}
