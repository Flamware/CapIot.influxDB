package services

import (
	"CapIot.influxDB/dao"
	"CapIot.influxDB/models"
	"fmt"
	"log"
)

// WriteToInfluxDB validates data and calls DAO, creating a bucket if needed
func WriteToInfluxDB(data models.DeviceData) error {
	// Validation
	log.Println(data)
	if data.DeviceID == "" {
		return fmt.Errorf("device_id cannot be empty")
	}
	if data.Temperature == 0 || data.Humidity == 0 {
		return fmt.Errorf("temperature and humidity cannot be zero")
	}

	// Call DAO to store data
	return dao.WriteData(data)
}

func GetDevices(location_id string) ([]string, error) {
	// Validation
	log.Println(location_id)
	if location_id == "" {
		return nil, fmt.Errorf("location_id cannot be empty")
	}

	// Call DAO to retrieve devices for the specified location
	devices, err := dao.GetDevices(location_id)
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve devices: %w", err)
	}

	return devices, nil
}
