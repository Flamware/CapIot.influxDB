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
