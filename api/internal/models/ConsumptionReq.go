package models

type ConsumptionReq struct {
	DeviceID  string  `json:"device_id"`
	Current   float64 `json:"current"`
	Voltage   float64 `json:"voltage"`
	Power     float64 `json:"power"`
	Timestamp string  `json:"timestamp"`
}
