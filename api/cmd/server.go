package main

import (
	"CapIot.influxDB/internal/config"
	"CapIot.influxDB/internal/controller"
	"CapIot.influxDB/internal/repository"
	"CapIot.influxDB/internal/service"
	"fmt"
	"log"
	"net/http"
)

func enableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*") // Or specify your frontend's origin
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		// Handle preflight requests
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func main() {
	// Load configuration
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Error loading configuration: %v", err)
	}

	// Initialize repository, service, and controller
	repo := repository.NewInfluxDBRepository(cfg.InfluxDBURL, cfg.InfluxDBToken, cfg.InfluxDBOrg)
	service := service.NewDataService(repo)
	controller := controller.NewDataController(service)

	// Create a new ServeMux to handle our routes
	mux := http.NewServeMux()
	mux.HandleFunc("/influxdb/sensordata", controller.HandleSensorData)
	mux.HandleFunc("/influxdb/query", controller.HandleQueryData)
	// Add the health check route here
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, "OK") // Simple response
	})

	// Wrap the ServeMux with the CORS middleware
	corsHandler := enableCORS(mux)

	// Start the server, passing the CORS-enabled handler
	serverAddress := fmt.Sprintf(":%s", cfg.Port)
	fmt.Printf("Listening on %s\n", serverAddress)
	err = http.ListenAndServe(serverAddress, corsHandler)
	if err != nil {
		log.Fatalf("Error starting server: %v", err)
	}
	// allow CORS

}

func showURL() string {
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Printf("Error loading configuration: %v", err)
		return ""
	}
	return fmt.Sprintf("http://localhost:%s", cfg.Port)
}

// You would call this function somewhere after the server starts
// to log the URL. For example, in the main function after ListenAndServe.
func init() {
	url := showURL()
	if url != "" {
		log.Printf("Server is running at: %s", url)
	}
}
