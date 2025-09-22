package controller

import (
	"CapIot.influxDB/internal/models"  // Use your actual module name
	"CapIot.influxDB/internal/service" // Use your actual module name
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
)

// DataController handles HTTP requests for sensor data.
type DataController struct {
	service *service.DataService
}

// NewDataController creates a new DataController.
func NewDataController(service *service.DataService) *DataController {
	return &DataController{
		service: service,
	}
}

// HandleSensorData handles the incoming HTTP request.
func (c *DataController) HandleSensorData(w http.ResponseWriter, r *http.Request) {

	log.Println("--- HandleSensorData function is being executed ---") // ADD THIS LINE

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, fmt.Sprintf("error reading request body: %v", err), http.StatusBadRequest)
		log.Printf("Error reading body: %v", err)
		return
	}
	defer r.Body.Close()

	log.Printf("Received data: %s\n", body)

	var dataArray []models.SensorData // Expect a slice (array) of SensorData
	err = json.Unmarshal(body, &dataArray)
	if err != nil {
		http.Error(w, fmt.Sprintf("error unmarshalling JSON: %v", err), http.StatusBadRequest)
		log.Printf("Error unmarshalling JSON: %v", err)
		return
	}

	for _, data := range dataArray { // Iterate through the array of sensor data
		err = c.service.ProcessAndSaveSensorData(r.Context(), data)
		if err != nil {
			http.Error(w, fmt.Sprintf("error processing data: %v", err), http.StatusInternalServerError)
			log.Printf("Service error: %v", err)
			return
		}
	}

	w.WriteHeader(http.StatusCreated)
	fmt.Fprintln(w, "Data received and written to InfluxDB")
}

func (dc *DataController) HandleQueryData(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req models.QueryRequest
	err := r.ParseForm()
	if err != nil {
		http.Error(w, "Error parsing form data", http.StatusBadRequest)
		return
	}

	req.LocationID = r.Form.Get("locationId")
	req.DeviceID = r.Form.Get("deviceId")
	req.SensorType = r.Form["sensorType[]"]
	req.WindowPeriod = r.Form.Get("windowPeriod")
	req.TimeRangeStart = r.Form.Get("timeRangeStart")
	req.TimeRangeStop = r.Form.Get("timeRangeStop")

	// Basic validation in the controller
	if req.LocationID == "" {
		http.Error(w, "locationId is required", http.StatusBadRequest)
		return
	}
	if req.DeviceID == "" {
		http.Error(w, "deviceId is required", http.StatusBadRequest)
		return
	}
	if len(req.SensorType) == 0 {
		http.Error(w, "sensorIds are required", http.StatusBadRequest)
		return
	}

	// Call the service to fetch data from InfluxDB, passing the request model
	data, err := dc.service.GetData(req)
	if err != nil {
		http.Error(w, "Error fetching data from InfluxDB", http.StatusInternalServerError)
		return
	}
	response, err := json.Marshal(data)
	if err != nil {
		http.Error(w, "Error marshalling response data", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
	w.Write(response)
}

func (c *DataController) HandleConsumptionData(writer http.ResponseWriter, request *http.Request) {
	log.Println("--- HandleConsumptionData function is being executed ---") // ADD THIS LINE
	writer.Header().Set("Content-Type", "application/json")

	var req models.ConsumptionReq
	if err := json.NewDecoder(request.Body).Decode(&req); err != nil {
		http.Error(writer, "Invalid request payload", http.StatusBadRequest)
		log.Printf("Error decoding request body: %v", err)
		return
	}
	defer request.Body.Close()

	// Basic validation in the controller
	if req.Timestamp == "" {
		http.Error(writer, "timestamp is required", http.StatusBadRequest)
		return
	}
	if req.DeviceID == "" {
		http.Error(writer, "deviceId is required", http.StatusBadRequest)
		return
	}
	// Call the service to process and save consumption data
	err := c.service.SaveConsumptionData(request.Context(), req)
	if err != nil {
		http.Error(writer, "Error processing consumption data", http.StatusInternalServerError)
		log.Printf("Service error: %v", err)
		return
	}

	writer.WriteHeader(http.StatusCreated)
	fmt.Fprintln(writer, "Consumption data received and written to InfluxDB")
}

func (c *DataController) HandleGetConsumptionData(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Check if the request method is GET.
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Create a ConsumptionQueryRequest struct and populate it from query parameters.
	var req models.ConsumptionQueryRequest

	// Get the device_id from the query parameters.
	req.DeviceID = r.URL.Query().Get("device_id")
	if req.DeviceID == "" {
		http.Error(w, "device_id is required", http.StatusBadRequest)
		return
	}

	// Get the metrics from the query parameters.
	req.Metrics = r.URL.Query()["metric"]
	if len(req.Metrics) == 0 {
		http.Error(w, "At least one metric is required", http.StatusBadRequest)
		return
	}

	// Get the time range from the query parameters.
	req.TimeRangeStart = r.URL.Query().Get("time_range_start")
	req.TimeRangeStop = r.URL.Query().Get("time_range_stop")

	// Call service to fetch consumption data
	data, err := c.service.GetConsumptionData(r.Context(), req)
	if err != nil {
		http.Error(w, fmt.Sprintf("Error fetching consumption data: %v", err), http.StatusInternalServerError)
		return
	}

	// Marshal and send JSON response
	response, err := json.Marshal(data)
	if err != nil {
		http.Error(w, "Error marshalling response data", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write(response)
}
