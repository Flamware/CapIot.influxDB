package models

import "time"

// DeviceData represents the data structure for device readings
type DeviceData struct {
	DeviceID    string    `json:"device_id"`
	Temperature float64   `json:"temperature"`
	Humidity    float64   `json:"humidity"`
	LocationID  string    `json:"location_id"`
	Timestamp   time.Time `json:"timestamp"`
}
