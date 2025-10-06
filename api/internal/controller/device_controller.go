package controller

import (
	"CapIot.influxDB/internal/models"  // Use your actual module name
	"CapIot.influxDB/internal/service" // Use your actual module name
	"CapIot.influxDB/internal/utils"
	"encoding/json"
	"fmt"
	"github.com/go-resty/resty/v2"
	"github.com/gorilla/mux"
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

// RespondWithJSON sends a JSON response with the specified status code.
func respondWithJSON(w http.ResponseWriter, code int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if payload != nil {
		if err := json.NewEncoder(w).Encode(payload); err != nil {
			log.Printf("Failed to encode JSON response: %v", err)
		}
	}
}

// HandleSensorData handles the incoming HTTP request.
func (c *DataController) HandleSensorData(w http.ResponseWriter, r *http.Request) {
	log.Println("--- HandleSensorData function is being executed ---")

	body, err := io.ReadAll(r.Body)
	if err != nil {
		apiErr := models.NewAPIError(models.ErrorCodeBadRequest, fmt.Sprintf("error reading request body: %v", err), nil, http.StatusBadRequest)
		utils.RespondWithError(w, apiErr)
		return
	}
	defer r.Body.Close()

	log.Printf("Received data: %s\n", body)

	var dataArray []models.SensorData
	err = json.Unmarshal(body, &dataArray)
	if err != nil {
		apiErr := models.NewAPIError(models.ErrorCodeBadRequest, fmt.Sprintf("error unmarshalling JSON: %v", err), nil, http.StatusBadRequest)
		utils.RespondWithError(w, apiErr)
		return
	}

	for _, data := range dataArray {
		err = c.service.ProcessAndSaveSensorData(r.Context(), data)
		if err != nil {
			apiErr := models.NewAPIError(models.ErrorCodeInternalServerError, fmt.Sprintf("error processing data: %v", err), nil, http.StatusInternalServerError)
			utils.RespondWithError(w, apiErr)
			return
		}
	}

	respondWithJSON(w, http.StatusCreated, map[string]string{"message": "Data received and written to InfluxDB"})
}

// HandleQueryData handles the request for sensor data queries.
func (c *DataController) HandleQueryData(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodGet {
		apiErr := models.NewAPIError(models.ErrorCodeBadRequest, "Invalid request method", nil, http.StatusMethodNotAllowed)
		utils.RespondWithError(w, apiErr)
		return
	}

	var req models.QueryRequest
	query := r.URL.Query()

	req.LocationID = query.Get("location_id")
	req.DeviceID = query.Get("device_id")
	req.SensorType = query["sensor_type"]
	req.WindowPeriod = query.Get("window_period")
	req.TimeRangeStart = query.Get("time_range_start")
	req.TimeRangeStop = query.Get("time_range_stop")

	if req.LocationID == "" {
		apiErr := models.NewAPIError(models.ErrorCodeMissingParameter, "location_id is required", nil, http.StatusBadRequest)
		utils.RespondWithError(w, apiErr)
		return
	}
	if req.DeviceID == "" {
		apiErr := models.NewAPIError(models.ErrorCodeMissingParameter, "device_id is required", nil, http.StatusBadRequest)
		utils.RespondWithError(w, apiErr)
		return
	}
	if len(req.SensorType) == 0 {
		apiErr := models.NewAPIError(models.ErrorCodeMissingParameter, "sensor_type is required", nil, http.StatusBadRequest)
		utils.RespondWithError(w, apiErr)
		return
	}

	data, err := c.service.GetData(req)
	if err != nil {
		apiErr := models.NewAPIError(models.ErrorCodeInternalServerError, fmt.Sprintf("Error fetching data from InfluxDB: %v", err), nil, http.StatusInternalServerError)
		utils.RespondWithError(w, apiErr)
		return
	}

	respondWithJSON(w, http.StatusOK, data)
}

// HandleConsumptionData handles the incoming HTTP request for consumption data.
func (c *DataController) HandleConsumptionData(w http.ResponseWriter, r *http.Request) {
	log.Println("--- HandleConsumptionData function is being executed ---")
	w.Header().Set("Content-Type", "application/json")

	var req models.ConsumptionReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apiErr := models.NewAPIError(models.ErrorCodeBadRequest, "Invalid request payload", nil, http.StatusBadRequest)
		utils.RespondWithError(w, apiErr)
		return
	}
	defer r.Body.Close()

	if req.Timestamp == "" {
		apiErr := models.NewAPIError(models.ErrorCodeMissingParameter, "timestamp is required", nil, http.StatusBadRequest)
		utils.RespondWithError(w, apiErr)
		return
	}
	if req.DeviceID == "" {
		apiErr := models.NewAPIError(models.ErrorCodeMissingParameter, "deviceId is required", nil, http.StatusBadRequest)
		utils.RespondWithError(w, apiErr)
		return
	}

	err := c.service.SaveConsumptionData(r.Context(), req)
	if err != nil {
		apiErr := models.NewAPIError(models.ErrorCodeInternalServerError, "Error processing consumption data", nil, http.StatusInternalServerError)
		utils.RespondWithError(w, apiErr)
		return
	}

	respondWithJSON(w, http.StatusCreated, map[string]string{"message": "Consumption data received and written to InfluxDB"})
}

// HandleGetConsumptionData handles the GET request for consumption data.
func (c *DataController) HandleGetConsumptionData(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodGet {
		apiErr := models.NewAPIError(models.ErrorCodeBadRequest, "Method not allowed", nil, http.StatusMethodNotAllowed)
		utils.RespondWithError(w, apiErr)
		return
	}

	var req models.ConsumptionQueryRequest
	query := r.URL.Query()

	// 1. Device ID (Required)
	req.DeviceID = query.Get("device_id")
	if req.DeviceID == "" {
		apiErr := models.NewAPIError(models.ErrorCodeMissingParameter, "deviceID is required", nil, http.StatusBadRequest)
		utils.RespondWithError(w, apiErr)
		return
	}

	// 2. Metrics (Required)
	// Note: r.URL.Query()["metric"] handles multiple 'metric' parameters
	req.Metrics = query["metric"]
	if len(req.Metrics) == 0 {
		apiErr := models.NewAPIError(models.ErrorCodeMissingParameter, "At least one metric is required (use 'metric=X&metric=Y')", nil, http.StatusBadRequest)
		utils.RespondWithError(w, apiErr)
		return
	}

	// 3. Time Range Start (Required)
	req.TimeRangeStart = query.Get("time_range_start")
	if req.TimeRangeStart == "" {
		apiErr := models.NewAPIError(models.ErrorCodeMissingParameter, "time_range_start is required", nil, http.StatusBadRequest)
		utils.RespondWithError(w, apiErr)
		return
	}

	// 4. Time Range Stop (Required)
	req.TimeRangeStop = query.Get("time_range_stop")
	if req.TimeRangeStop == "" {
		apiErr := models.NewAPIError(models.ErrorCodeMissingParameter, "time_range_stop is required", nil, http.StatusBadRequest)
		utils.RespondWithError(w, apiErr)
		return
	}

	// 5. Window Period (CRITICAL: This line was missing)
	req.WindowPeriod = query.Get("window_period")
	if req.WindowPeriod == "" {
		apiErr := models.NewAPIError(models.ErrorCodeMissingParameter, "window_period is required (e.g., '1h', '30m')", nil, http.StatusBadRequest)
		utils.RespondWithError(w, apiErr)
		return
	}

	data, err := c.service.GetConsumptionData(r.Context(), req)
	if err != nil {
		apiErr := models.NewAPIError(models.ErrorCodeInternalServerError, fmt.Sprintf("Error fetching consumption data: %v", err), nil, http.StatusInternalServerError)
		utils.RespondWithError(w, apiErr)
		return
	}

	respondWithJSON(w, http.StatusOK, data)
}

// HandleProvisioning acts as a proxy to a provisioning endpoint.
func (c *DataController) HandleProvisioning(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodGet {
		log.Println("Invalid request method for provisioning")
		apiErr := models.NewAPIError(models.ErrorCodeBadRequest, "Invalid request method", nil, http.StatusMethodNotAllowed)
		utils.RespondWithError(w, apiErr)
		return
	}

	deviceID := mux.Vars(r)["deviceID"]
	if deviceID == "" {
		log.Println("Missing deviceID in URL path")
		apiErr := models.NewAPIError(models.ErrorCodeMissingParameter, "deviceID is required", nil, http.StatusBadRequest)
		utils.RespondWithError(w, apiErr)
		return
	}

	client := resty.New()
	url := fmt.Sprintf("%s/devices/provisioning/%s", os.Getenv("API_URL"), deviceID)

	resp, err := client.R().
		Get(url)

	if err != nil {
		log.Println("Error making provisioning request:", err)
		apiErr := models.NewAPIError(models.ErrorCodeInternalServerError, fmt.Sprintf("Failed to provision device: %v", err), nil, http.StatusInternalServerError)
		utils.RespondWithError(w, apiErr)
		return
	}
	log.Println("Provisioning response status:", resp.Status())
	if resp.StatusCode() >= 400 {
		body, readErr := ioutil.ReadAll(resp.RawBody())
		if readErr != nil {
			log.Println("Error reading upstream error message:", readErr)
			log.Printf("Url: %s, Status: %d, Original Error: %v", url, resp.StatusCode(), readErr)
			apiErr := models.NewAPIError(models.ErrorCodeInternalServerError, "Failed to read upstream error message", nil, http.StatusInternalServerError)
			utils.RespondWithError(w, apiErr)
			return
		}

		apiErr := models.NewAPIError(models.ErrorCodeInternalServerError, string(body), nil, resp.StatusCode())
		utils.RespondWithError(w, apiErr)
		return
	}

	var result ProvisioningResponse
	err = json.Unmarshal(resp.Body(), &result)
	if err != nil {
		log.Println("Error parsing provisioning response:", err)
		apiErr := models.NewAPIError(models.ErrorCodeInternalServerError, "Failed to parse provisioning response", nil, http.StatusInternalServerError)
		utils.RespondWithError(w, apiErr)
		return
	}

	if result.Token == "" {
		log.Println("No token received in provisioning response")
		apiErr := models.NewAPIError(models.ErrorCodeInternalServerError, "Provisioning failed: No token received", nil, http.StatusInternalServerError)
		utils.RespondWithError(w, apiErr)
		return
	}

	respondWithJSON(w, http.StatusOK, result)
	log.Printf("Provisioned device %s with token: %s", deviceID, result.Token)
}
