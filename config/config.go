package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

func LoadConfig() {
	err := godotenv.Load()
	if err != nil {
		log.Fatal("Error loading .env file")
	}

	// Load environment variables into the app
	InfluxURL := os.Getenv("INFLUXDB_URL")
	InfluxToken := os.Getenv("INFLUXDB_TOKEN")
	JWTSecret := os.Getenv("JWT_SECRET")

	// Set them globally or in a config struct
	log.Println("Loaded config: ", InfluxURL, InfluxToken, JWTSecret)
}
