// dao/write_dao.go
package dao

import (
	"CapIot.influxDB/config"
	"CapIot.influxDB/models"
	"context"
	"fmt"
	"log"
	"time"

	influxdb2 "github.com/influxdata/influxdb-client-go/v2"
)

// WriteData writes device data to InfluxDB, creating a bucket if needed
func WriteData(data models.DeviceData) error {
	client := config.GetInfluxClient()
	writeAPI := client.WriteAPIBlocking("Technopure", data.LocationID)

	// Check if the bucket exists; if not, create it
	if !BucketExists(data.LocationID) {
		err := CreateBucket("Technopure", data.LocationID)
		if err != nil {
			return fmt.Errorf("failed to create bucket: %w", err)
		}
	}

	// Create InfluxDB point
	point := influxdb2.NewPoint(
		"device_measurements",
		map[string]string{"device_id": data.DeviceID}, // Tags
		map[string]interface{}{
			"temperature": data.Temperature,
			"humidity":    data.Humidity,
		}, // Fields
		time.Now(), // Timestamp
	)

	// Write data to InfluxDB
	err := writeAPI.WritePoint(context.Background(), point)
	if err != nil {
		log.Printf("❌ Error writing data to InfluxDB: %v", err)
		return fmt.Errorf("failed to write to InfluxDB: %w", err)
	}

	log.Println("✅ Data successfully written to InfluxDB")
	return nil
}

// GetDevices retrieves the list of device IDs for a specific location from InfluxDB
func GetDevices(location_id string) ([]string, error) {
	client := config.GetInfluxClient()
	var devices []string

	// Replace this with actual logic to query InfluxDB using the queryAPI
	// For example, fetching the data using the InfluxDB client
	queryAPI := client.QueryAPI("Technopure")

	query := fmt.Sprintf(`from(bucket: "%s")
		|> range(start: 0)
		|> filter(fn: (r) => r._measurement == "device_measurements")
		|> keep(columns: ["device_id"])
		|> unique(column: "device_id")`, location_id)

	result, err := queryAPI.Query(context.Background(), query)
	if err != nil {
		log.Printf("❌ Error querying data from InfluxDB: %v", err)
		return nil, fmt.Errorf("failed to query from InfluxDB: %w", err)
	}

	for result.Next() {
		record := result.Record()
		log.Printf("Available fields: %v", record.Values())

		// Assert the device_id field properly
		deviceID, ok := record.Values()["device_id"].(string)
		if !ok {
			log.Printf("⚠️ Found a non-string device_id, skipping...") // Or handle appropriately
			continue
		}

		log.Printf("Found device_id: %s", deviceID)
		devices = append(devices, deviceID)
	}

	// Check for any query errors
	if result.Err() != nil {
		log.Printf("❌ Query error: %v", result.Err())
		return nil, fmt.Errorf("query error: %w", result.Err())
	}

	log.Println("✅ Device IDs successfully retrieved from InfluxDB")
	return devices, nil
}
