package models

type QueryRequest struct {
	LocationID     string   `json:"locationId"`
	DeviceID       string   `json:"deviceId"`
	SensorType     []string `json:"sensorIds"`
	TimeRangeStart string   `json:"timeRangeStart"`
	TimeRangeStop  string   `json:"timeRangeStop"`
	WindowPeriod   string   `json:"windowPeriod"`
}
