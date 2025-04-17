package models

type SensorQueryResponse struct {
	DeviceID string                              `json:"deviceId"`
	Readings map[string][]map[string]interface{} `json:"readings"` // Grouped by sensor type
}
