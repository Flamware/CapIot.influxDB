package routes

import (
	"CapIot.influxDB/internal/controller"
	"fmt"
	"net/http"
)

// RegisterRoutes registers all application routes
// RegisterRoutes registers all application routes
func RegisterRoutes(mux *http.ServeMux, controller *controller.DataController) {
	// Sensor data
	mux.HandleFunc("/influxdb/sensordata", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			controller.HandleSensorData(w, r)
		case http.MethodGet:
			controller.HandleQueryData(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Consumption data (POST to insert, GET to retrieve)
	mux.HandleFunc("/influxdb/metrics", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			controller.HandleConsumptionData(w, r)
		case http.MethodGet:
			controller.HandleGetConsumptionData(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Health check (GET only)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			w.WriteHeader(http.StatusOK)
			fmt.Fprint(w, "OK")
			return
		}
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	})
}
