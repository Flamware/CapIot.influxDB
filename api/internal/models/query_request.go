package models

type QueryRequest struct {
	LocationID     string   `json:"location_id"`
	DeviceID       string   `json:"device_id"`
	SensorType     []string `json:"sensor_type"`
	TimeRangeStart string   `json:"time_range_start"`
	TimeRangeStop  string   `json:"time_range_stop"`
	WindowPeriod   string   `json:"window_period"`
}

type ConsumptionQueryRequest struct {
	DeviceID       string   `json:"device_id"`
	Metrics        []string `json:"metrics"`          // e.g., ["current","voltage"]
	TimeRangeStart string   `json:"time_range_start"` // ISO8601 timestamp
	TimeRangeStop  string   `json:"time_range_stop"`  // ISO8601 timestamp
}
