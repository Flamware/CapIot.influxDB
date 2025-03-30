package config

import (
	"context"
	"fmt"
	"github.com/influxdata/influxdb-client-go/v2"
	"log"
)

var influxClient influxdb2.Client

// InitInfluxClient initializes the InfluxDB client and checks the connection
func InitInfluxClient(connectionString string, influxToken string) error {
	influxClient = influxdb2.NewClient(connectionString, influxToken)

	// Check the connection health
	health, err := influxClient.Health(context.Background())
	if err != nil {
		log.Printf("Error connecting to InfluxDB: %v", err)
		return fmt.Errorf("failed to connect to In-fluxDB: %v", err)
	}

	// Log the health status
	if health.Status == "pass" {
		log.Println("Successfully connected to InfluxDB!")
	} else {
		log.Printf("InfluxDB health check failed: %v", health.Message)
		return fmt.Errorf("InfluxDB health check failed: %v", health.Message)
	}

	return nil
}

func GetInfluxClient() influxdb2.Client {
	return influxClient
}
