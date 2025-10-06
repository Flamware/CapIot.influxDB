package models

import "time"

type SensorQueryResponse struct {
	DeviceID string                              `json:"deviceId"`
	Readings map[string][]map[string]interface{} `json:"readings"` // Grouped by sensor type
}
type ConsumptionQueryResponse struct {
	DeviceID string                 `json:"device_id"`
	Readings map[string][]DataPoint `json:"readings"`
}
type DataPoint struct {
	Time time.Time `json:"time"`
	// CHANGED: Use *float64 to allow null values in JSON response.
	Value *float64 `json:"value"`
}
