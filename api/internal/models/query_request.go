package models

type QueryRequest struct {
	LocationID     string   `json:"locationId"`
	DeviceID       string   `json:"deviceId"`
	SensorType     []string `json:"sensorIds"`
	TimeRangeStart string   `json:"timeRangeStart"`
	TimeRangeStop  string   `json:"timeRangeStop"`
	WindowPeriod   string   `json:"windowPeriod"`
}

type ConsumptionQueryRequest struct {
	DeviceID       string   `json:"device_id"`
	Metrics        []string `json:"metrics"`          // e.g., ["current","voltage"]
	TimeRangeStart string   `json:"time_range_start"` // ISO8601 timestamp
	TimeRangeStop  string   `json:"time_range_stop"`  // ISO8601 timestamp
}
