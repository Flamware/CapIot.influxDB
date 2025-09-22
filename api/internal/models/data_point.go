package models

import "time"

type SensorData struct {
	Time      time.Time `json:"time"`
	Location  string    `json:"location_id"`
	DeviceID  string    `json:"device_id"`
	SensorID  string    `json:"sensor_id"`
	Field     string    `json:"field"`
	Value     float64   `json:"value"`
	Timestamp string    `json:"timestamp"`
}
