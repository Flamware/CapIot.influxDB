// controllers/write_controller.go
package controllers

import (
	"CapIot.influxDB/models"
	"CapIot.influxDB/services"
	"encoding/json"
	"fmt"
	"github.com/gorilla/mux"
	"io/ioutil"
	"log"
	"net/http"
)

// WriteData handles HTTP POST requests to write data to InfluxDB
func WriteData(w http.ResponseWriter, r *http.Request) {
	// Read the request body
	body, err := ioutil.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Error reading request body", http.StatusBadRequest)
		return
	}

	// Decode the request body
	var requestData models.DeviceData

	err = json.Unmarshal(body, &requestData)
	if err != nil {
		http.Error(w, "Invalid JSON format", http.StatusBadRequest)
		return
	}

	// Log the unmarshalled data
	log.Printf("Decoded Request Data: %+v", requestData)

	// Now you can call the service layer
	err = services.WriteToInfluxDB(requestData)
	if err != nil {
		http.Error(w, fmt.Sprintf("Error writing to InfluxDB: %v", err), http.StatusInternalServerError)
		return
	}

	// Success response
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("✅ Data written to InfluxDB successfully"))
}

func GetDevices(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	locationID := vars["location_id"]

	devices, err := services.GetDevices(locationID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Error retrieving devices: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(devices); err != nil {
		http.Error(w, fmt.Sprintf("Error encoding response: %v", err), http.StatusInternalServerError)
	}
}
