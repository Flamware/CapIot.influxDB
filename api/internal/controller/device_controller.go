package controller

import (
	"CapIot.influxDB/internal/models"  // Use your actual module name
	"CapIot.influxDB/internal/service" // Use your actual module name
	"encoding/json"
	"fmt"
	"github.com/go-resty/resty/v2"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"os"
)

type ProvisioningResponse struct {
	Token string `json:"provisioning_token"`
}

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

	req.LocationID = r.Form.Get("locationID")
	req.DeviceID = r.Form.Get("deviceID")
	req.SensorType = r.Form["sensorType[]"]
	req.WindowPeriod = r.Form.Get("windowPeriod")
	req.TimeRangeStart = r.Form.Get("timeRangeStart")
	req.TimeRangeStop = r.Form.Get("timeRangeStop")

	// Basic validation in the controller
	if req.LocationID == "" {
		http.Error(w, "locationID is required", http.StatusBadRequest)
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
	req.DeviceID = r.URL.Query().Get("deviceID")
	if req.DeviceID == "" {
		http.Error(w, "deviceID is required", http.StatusBadRequest)
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

// HandleProvisioning acts as a proxy to a provisioning endpoint.
func (c *DataController) HandleProvisioning(w http.ResponseWriter, r *http.Request) {
	// Define a struct to hold the request body
	var requestBody struct {
		DeviceID string `json:"deviceID"`
	}

	// Decode the JSON request body
	err := json.NewDecoder(r.Body).Decode(&requestBody)
	if err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		log.Printf("Error decoding request body: %v", err)
		return
	}

	// Get the deviceID from the decoded body
	deviceID := requestBody.DeviceID
	if deviceID == "" {
		http.Error(w, "deviceID is required in the request body", http.StatusBadRequest)
		log.Printf("Provisioning failed: deviceID is missing in the request body")
		return
	}

	client := resty.New()
	url := fmt.Sprintf("%s/devices/provisioning/%s", os.Getenv("API_URL"), deviceID)

	// Make the POST request to the provisioning endpoint
	resp, err := client.R().
		Post(url)

	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to provision device: %v", err), http.StatusInternalServerError)
		log.Printf("Provisioning request error: %v", err)
		return
	}

	// --- FIX IS HERE ---
	// Check the HTTP status code of the response first.
	// If it's not a success code (2xx), it's likely an error with a plain text body.
	if resp.StatusCode() >= 400 {
		log.Printf("Upstream API returned a non-success status code: %d", resp.StatusCode())

		// Read the body as plain text to get the error message.
		body, readErr := ioutil.ReadAll(resp.RawBody())
		if readErr != nil {
			http.Error(w, "Failed to read upstream error message", http.StatusInternalServerError)
			log.Printf("Error reading upstream error body: %v", readErr)
			return
		}

		// Return the upstream error message and status code to the client.
		http.Error(w, string(body), resp.StatusCode())
		return
	}
	// --- END OF FIX ---

	// The rest of your code for successful JSON responses
	var result ProvisioningResponse
	err = json.Unmarshal(resp.Body(), &result)
	if err != nil {
		http.Error(w, "Failed to parse provisioning response", http.StatusInternalServerError)
		log.Printf("Error unmarshalling provisioning response: %v", err)
		return
	}
	log.Printf("Provisioning response: %+v", result)
	if result.Token == "" {
		http.Error(w, "Provisioning failed: No token received", http.StatusInternalServerError)
		log.Printf("Provisioning failed for device %s: No token received", deviceID)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
	log.Printf("Provisioned device %s with token: %s", deviceID, result.Token)
}
