package main

import (
	"CapIot.influxDB/internal/config"
	"CapIot.influxDB/internal/controller"
	"CapIot.influxDB/internal/repository"
	"CapIot.influxDB/internal/routes"
	"CapIot.influxDB/internal/service"
	"fmt"
	"github.com/gorilla/mux"
	"log"
	"net/http"
)

func enableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Credentials", "true")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	// Load config
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Error loading configuration: %v", err)
	}

	// Initialize repo, service, controller
	repo := repository.NewInfluxDBRepository(cfg.InfluxDBURL, cfg.InfluxDBToken, cfg.InfluxDBOrg)
	svc := service.NewDataService(repo)
	ctrl := controller.NewDataController(svc)

	// Initialize the mux.Router
	router := mux.NewRouter()

	// Register all routes with the mux.Router
	routes.RegisterRoutes(router, ctrl)

	// Wrap the mux.Router with the CORS middleware
	corsHandler := enableCORS(router)

	// Start server
	serverAddress := fmt.Sprintf(":%s", cfg.Port)
	fmt.Printf("Listening on %s\n", serverAddress)
	log.Printf("Server is running at: http://localhost:%s", cfg.Port)

	// Use the correctly wrapped router to start the server
	if err := http.ListenAndServe(serverAddress, corsHandler); err != nil {
		log.Fatalf("Error starting server: %v", err)
	}
}
