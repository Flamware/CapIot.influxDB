// main.go
package main

import (
	"CapIot.influxDB/config"
	"CapIot.influxDB/routes"
	"github.com/joho/godotenv"
	"github.com/rs/cors"
	"log"
	"net/http"
	"os"
)

func main() {
	// Load environment variables from .env file
	err := godotenv.Load()
	if err != nil {
		log.Fatal("Error loading .env file")
	}

	// Get the InfluxDB token and org from environment variables
	influxToken := os.Getenv("INFLUXDB_TOKEN")
	influxOrg := os.Getenv("INFLUXDB_ORG")
	if influxToken == "" || influxOrg == "" {
		log.Fatal("InfluxDB token or org is not set in environment variables")
	}

	// Define the connection string for InfluxDB
	connectionString := "http://localhost:8086/"

	// Initialize InfluxDB client
	err = config.InitInfluxClient(connectionString, influxToken)
	if err != nil {
		return
	}

	// Initialize Redis
	err = config.InitRedis()
	if err != nil {
		log.Fatal("Error initializing Redis:", err)
	}

	// Set up routes
	mux := routes.SetupRouter()

	// CORS setup
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE"},
		AllowedHeaders:   []string{"Content-Type", "Authorization"},
		AllowCredentials: true,
	})
	handler := c.Handler(mux)

	// Start the HTTP server
	log.Println("Server is running on port 8081...")
	err = http.ListenAndServe(":8081", handler)
	if err != nil {
		log.Fatal("Error starting server:", err)
	}
}
