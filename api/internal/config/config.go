package config

import (
	"fmt"
	"github.com/joho/godotenv"
	"log"
	"os"
)

// Config holds the application's configuration.
type Config struct {
	InfluxDBURL     string
	InfluxDBToken   string
	InfluxDBOrg     string
	DefaultLocation string
	Port            string
}

// LoadConfig loads the configuration from environment variables.
func LoadConfig() (Config, error) {
	//load env variables
	err := godotenv.Load()
	if err != nil {
		log.Println("No .env file found, relying on system environment variables")
	}

	cfg := Config{
		InfluxDBURL:     os.Getenv("INFLUXDB_URL"),
		InfluxDBToken:   os.Getenv("INFLUXDB_TOKEN"),
		InfluxDBOrg:     os.Getenv("INFLUXDB_ORG"),
		DefaultLocation: "default_location", // Could also come from an env var
		Port:            "8000",             // Make this configurable
	}
	if cfg.InfluxDBURL == "" || cfg.InfluxDBToken == "" || cfg.InfluxDBOrg == "" {
		return Config{}, fmt.Errorf("InfluxDB configuration is incomplete. Please set INFLUXDB_URL, INFLUXDB_TOKEN, and INFLUXDB_ORG environment variables")
	}
	return cfg, nil
}
