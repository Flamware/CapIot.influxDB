package repository

import (
	"context"
	"fmt"
	"log"
	"math"
	"strings"
	"time"

	"CapIot.influxDB/internal/models" // Use your actual module name
	influxdb2 "github.com/influxdata/influxdb-client-go/v2"
	"github.com/influxdata/influxdb-client-go/v2/api/write"
)

// Global constant for the API limit, matching the frontend's MAX_POINTS
const MAX_API_QUERY_POINTS = 15000

// Repository Interface
type Repository interface {
	WriteSensorData(ctx context.Context, data models.SensorData) error
	BucketExists(ctx context.Context, name string) (bool, error)
	CreateBucket(ctx context.Context, name string) error
	Query(query models.QueryRequest) ([]models.SensorQueryResponse, error)
	WriteConsumptionData(ctx context.Context, req models.ConsumptionReq) error
	// Signature mise à jour pour utiliser models.ConsumptionQueryRequest
	QueryConsumptionData(ctx context.Context, req models.ConsumptionQueryRequest) ([]models.ConsumptionQueryResponse, error)
}

// InfluxDBRepository is a repository for writing data to InfluxDB.
type InfluxDBRepository struct { // Changed to struct type
	client influxdb2.Client
	org    string
}

// NewInfluxDBRepository creates a new InfluxDBRepository.
func NewInfluxDBRepository(url, token, org string) *InfluxDBRepository {
	client := influxdb2.NewClient(url, token)
	return &InfluxDBRepository{
		client: client,
		org:    org,
	}
}

// WriteSensorData writes the sensor data to InfluxDB.
func (r *InfluxDBRepository) WriteSensorData(ctx context.Context, data models.SensorData) error {
	// defer r.client.Close() // Remove this line
	bucket := data.Location
	if bucket == "" {
		bucket = "default_location"
	}
	writeAPI := r.client.WriteAPIBlocking(r.org, bucket)

	// Use a single point with multiple fields for all sensor data.
	fields := make(map[string]interface{})

	// Add the sensor value to the fields map based on the Field type
	fields[data.Field] = data.Value

	var p *write.Point
	if data.Timestamp != "" { // Check if the Timestamp string is not empty
		stm32Time, err := time.Parse(time.RFC3339, data.Timestamp)
		if err != nil {
			log.Printf("Error parsing timestamp '%s', using current time: %v\n", data.Timestamp, err)
			p = influxdb2.NewPoint(
				"sensor_data", // Measurement name.
				map[string]string{"device_id": data.DeviceID}, // tags
				fields,
				time.Now(), //  Use server time
			)
		} else {
			p = influxdb2.NewPoint(
				"sensor_data", // Measurement name.
				map[string]string{"device_id": data.DeviceID}, // tags
				fields,
				stm32Time, // Use the timestamp from the STM32.
			)
		}
	} else {
		p = influxdb2.NewPoint(
			"sensor_data", // Measurement name.
			map[string]string{"device_id": data.DeviceID}, // tags
			fields,
			time.Now(),
		)
	}

	err := writeAPI.WritePoint(ctx, p)
	if err != nil {
		return fmt.Errorf("error writing to InfluxDB: %w", err)
	}
	log.Printf("Data point written to InfluxDB, bucket: %s, device_id: %s, field: %s, value: %f\n", bucket, data.DeviceID, data.Field, data.Value)
	return nil
}

// BucketExists checks if a bucket exists in InfluxDB.
func (r *InfluxDBRepository) BucketExists(ctx context.Context, name string) (bool, error) {
	bucketsAPI := r.client.BucketsAPI()
	// The FindBucketByName method requires a context.
	_, err := bucketsAPI.FindBucketByName(ctx, name)
	if err != nil {
		if strings.Contains(err.Error(), "not found") { // Check if error indicates not found
			return false, nil // Return false, nil on "not found"
		}
		return false, fmt.Errorf("error checking bucket existence: %w", err)
	}
	return true, nil
}

// CreateBucket creates a new bucket in InfluxDB.
func (r *InfluxDBRepository) CreateBucket(ctx context.Context, name string) error {
	orgAPI := r.client.OrganizationsAPI()

	// Find Organization
	org, err := orgAPI.FindOrganizationByName(context.Background(), r.org)
	if err != nil {
		log.Printf("Error finding organization '%s': %v", r.org, err)
		return err
	}
	if org == nil {
		return fmt.Errorf("organization '%s' not found", r.org)
	}

	bucketsAPI := r.client.BucketsAPI()
	_, err = bucketsAPI.CreateBucketWithName(context.Background(), org, name)
	if err != nil {
		log.Printf("Error creating bucket: %v", err)
		return err
	}

	log.Printf("✅ Bucket '%s' created successfully.", name)
	return nil
}

// Query executes a query against InfluxDB and returns the results as a slice of models.SensorQueryResponse.
func (r *InfluxDBRepository) Query(req models.QueryRequest) ([]models.SensorQueryResponse, error) {
	ctx := context.Background()
	queryAPI := r.client.QueryAPI(r.org)

	// Convert location_id to a string to use as bucket name
	bucketName := req.LocationID

	// Check if the bucket exists before running the query
	bucketExists, err := r.BucketExists(ctx, bucketName)
	if err != nil {
		return nil, fmt.Errorf("error checking bucket existence: %w", err)
	}
	if !bucketExists {
		log.Printf("Bucket '%s' does not exist. Returning empty data.", bucketName)
		return []models.SensorQueryResponse{}, nil // Return empty slice as requested
	}

	var rangeClause string
	if req.TimeRangeStart != "" && req.TimeRangeStop != "" {
		rangeClause = fmt.Sprintf(`|> range(start: %s, stop: %s)`, req.TimeRangeStart, req.TimeRangeStop)
	} else {
		// Log error if both start and stop are not provided
		log.Println("Warning: Time range start and stop not provided, using default range.")
		return nil, fmt.Errorf("time range start and stop must be provided")
	}

	fieldFilters := make([]string, len(req.SensorType))
	for i, sensorID := range req.SensorType {
		fieldFilters[i] = fmt.Sprintf(`r["_field"] == "%s"`, sensorID)
	}
	fieldFilterClause := strings.Join(fieldFilters, " or ")

	fluxQuery := fmt.Sprintf(`
       from(bucket: "%s")
       %s
       |> filter(fn: (r) => r["_measurement"] == "sensor_data")
       |> filter(fn: (r) => r["device_id"] == "%s")
       |> filter(fn: (r) => %s)
       |> aggregateWindow(every: %s, fn: mean, createEmpty: true)
       |> yield(name: "mean")
    `, bucketName, rangeClause, req.DeviceID, fieldFilterClause, req.WindowPeriod)
	log.Printf("Executing InfluxDB query: %s", fluxQuery)
	// Execute the query
	result, err := queryAPI.Query(ctx, fluxQuery)
	if err != nil {
		log.Printf("Error querying InfluxDB: %v\nQuery: %s", err, fluxQuery)
		return nil, fmt.Errorf("error querying InfluxDB: %w", err)
	}

	// Process the query results and group by DeviceID and LocationID, then by field
	groupedData := make(map[string]map[string]map[string][]map[string]interface{}) // map[deviceID]map[locationID]map[fieldType][]reading

	for result.Next() {
		// Observe when there is an error
		if result.Err() != nil {
			log.Printf("Error during query iteration: %v\nRow: %v", result.Err(), result)
			continue
		}
		record := result.Record()
		reading := make(map[string]interface{})
		reading["time"] = record.Time().Format(time.RFC3339) // Format time as string

		var deviceID string
		if id, ok := record.ValueByKey("device_id").(string); ok {
			deviceID = id
		}
		var locationIDStr string
		// Note: Location tag is not guaranteed in sensor_data measurement based on WriteSensorData.
		// If LocationID is used as the Bucket Name, this tag might not exist.
		// We'll rely on the field name/value for data processing.
		if loc, ok := record.ValueByKey("location").(string); ok {
			locationIDStr = loc
		}

		var field string
		if f, ok := record.ValueByKey("_field").(string); ok {
			field = f
		}
		// Handle null values from aggregateWindow(createEmpty: true)
		if value := record.ValueByKey("_value"); value != nil {
			if valueFloat, ok := value.(float64); ok {
				reading["value"] = valueFloat
			} else if valueInt, ok := value.(int64); ok {
				reading["value"] = float64(valueInt)
			} else {
				reading["value"] = nil // Ensure nil for non-numeric/unknown types from aggregation
			}
		} else {
			reading["value"] = nil // Explicitly set nil for nulls returned by createEmpty: true
		}

		if _, ok := groupedData[deviceID]; !ok {
			groupedData[deviceID] = make(map[string]map[string][]map[string]interface{})
		}
		// Grouping by locationIDStr might be empty if the 'location' tag is missing, using a default key based on bucketName
		if locationIDStr == "" {
			locationIDStr = bucketName // Use the bucket name as a fallback location identifier
		}

		if _, ok := groupedData[deviceID][locationIDStr]; !ok {
			groupedData[deviceID][locationIDStr] = make(map[string][]map[string]interface{})
		}
		if _, ok := groupedData[deviceID][locationIDStr][field]; !ok {
			groupedData[deviceID][locationIDStr][field] = []map[string]interface{}{}
		}
		groupedData[deviceID][locationIDStr][field] = append(groupedData[deviceID][locationIDStr][field], reading)
	}

	// Format the grouped data into the SensorQueryResponse model
	var response []models.SensorQueryResponse
	for deviceID, locationMap := range groupedData {
		for _, fieldMap := range locationMap { // We iterate over locations within a device
			response = append(response, models.SensorQueryResponse{
				DeviceID: deviceID,
				Readings: fieldMap, // Directly assign fieldMap to Readings
			})
		}
	}

	return response, nil
}

// WriteConsumptionData writes the consumption data to InfluxDB.
func (r *InfluxDBRepository) WriteConsumptionData(ctx context.Context, req models.ConsumptionReq) error {
	// defer r.client.Close() // Remove this line
	bucket := "consumption_data"
	writeAPI := r.client.WriteAPIBlocking(r.org, bucket)

	fields := map[string]interface{}{
		"current": req.Current,
		"voltage": req.Voltage,
		"power":   req.Power,
	}

	var p *write.Point
	if req.Timestamp != "" { // Check if the Timestamp string is not empty
		stm32Time, err := time.Parse(time.RFC3339, req.Timestamp)
		if err != nil {
			log.Printf("Error parsing timestamp '%s', using current time: %v\n", req.Timestamp, err)
			p = influxdb2.NewPoint(
				"consumption_data",                           // Measurement name.
				map[string]string{"device_id": req.DeviceID}, // tags
				fields,
				time.Now(), //  Use server time
			)
		} else {
			p = influxdb2.NewPoint(
				"consumption_data",                           // Measurement name.
				map[string]string{"device_id": req.DeviceID}, // tags
				fields,
				stm32Time, // Use the timestamp from the STM32.
			)
		}
	} else {
		p = influxdb2.NewPoint(
			"consumption_data",                           // Measurement name.
			map[string]string{"device_id": req.DeviceID}, // tags
			fields,
			time.Now(),
		)
	}

	err := writeAPI.WritePoint(ctx, p)
	if err != nil {
		return fmt.Errorf("error writing consumption data to InfluxDB: %w", err)
	}
	log.Printf("Consumption data point written to InfluxDB, bucket: %s, device_id: %s\n", bucket, req.DeviceID)
	return nil
}

// QueryConsumptionData queries consumption data from InfluxDB and formats it as a nested structure.
func (r *InfluxDBRepository) QueryConsumptionData(ctx context.Context, req models.ConsumptionQueryRequest) ([]models.ConsumptionQueryResponse, error) {
	queryAPI := r.client.QueryAPI(r.org)

	// Check for all required fields in the request
	if req.TimeRangeStart == "" || req.TimeRangeStop == "" || req.WindowPeriod == "" {
		return nil, fmt.Errorf("time range start, stop, and window period must be provided")
	}

	// --- API Side Validation Logic (matching frontend) ---
	// 1. Parse times
	start, err := time.Parse(time.RFC3339, req.TimeRangeStart)
	if err != nil {
		return nil, fmt.Errorf("invalid time_range_start format: %w", err)
	}
	stop, err := time.Parse(time.RFC3339, req.TimeRangeStop)
	if err != nil {
		return nil, fmt.Errorf("invalid time_range_stop format: %w", err)
	}

	if start.After(stop) || start.Equal(stop) {
		return nil, fmt.Errorf("time range start must be strictly before time range stop")
	}

	// 2. Parse window period (e.g., "1m", "5s")
	window, err := time.ParseDuration(req.WindowPeriod)
	if err != nil {
		return nil, fmt.Errorf("invalid window_period format: %w", err)
	}

	if window <= 0 {
		return nil, fmt.Errorf("window period must be positive")
	}

	// 3. Calculate total points
	duration := stop.Sub(start)

	// Calculate total points and round up (Ceil)
	// We use float64 division to prevent overflow from large duration/window values
	totalPoints := math.Ceil(float64(duration) / float64(window))

	if totalPoints > float64(MAX_API_QUERY_POINTS) {
		log.Printf("Query rejected: Total points requested (%.0f) exceeds limit (%d)", totalPoints, MAX_API_QUERY_POINTS)
		return nil, fmt.Errorf("query too broad: requested points %.0f exceeds maximum API limit %d. Please adjust time range or window period", totalPoints, MAX_API_QUERY_POINTS)
	}
	log.Printf("Query validation passed. Total estimated points: %.0f (Max: %d)", totalPoints, MAX_API_QUERY_POINTS)
	// --- End Validation Logic ---

	// Build Flux query
	fluxQuery := fmt.Sprintf(`
       from(bucket: "%s")
       |> range(start: %s, stop: %s)
       |> filter(fn: (r) => r["_measurement"] == "consumption_data")
       |> filter(fn: (r) => r["device_id"] == "%s")
       |> filter(fn: (r) => %s)
       |> aggregateWindow(every: %s, fn: mean, createEmpty: true) // createEmpty: true ensures nulls for missing periods
       |> yield(name: "mean")
    `, "consumption_data", req.TimeRangeStart, req.TimeRangeStop, req.DeviceID, createMetricFilterClause(req.Metrics), req.WindowPeriod)
	log.Printf("Executing InfluxDB consumption query: %s", fluxQuery)

	// Execute query
	result, err := queryAPI.Query(ctx, fluxQuery)
	if err != nil {
		log.Printf("Error querying InfluxDB: %v\nQuery: %s", err, fluxQuery)
		return nil, fmt.Errorf("error querying InfluxDB: %w", err)
	}

	// Prepare the final response structure
	response := models.ConsumptionQueryResponse{
		DeviceID: req.DeviceID,
		Readings: make(map[string][]models.DataPoint),
	}

	for result.Next() {
		record := result.Record()
		metricName := record.Field()
		timestamp := record.Time()

		var valuePtr *float64 // Defaults to nil, representing JSON null

		// Process value only if it is NOT nil (i.e., it's a real data point)
		if v := record.Value(); v != nil {
			var f float64
			var ok bool

			// Attempt to convert to float64
			if f, ok = v.(float64); ok {
				// Successfully converted to float64
			} else if vInt, ok := v.(int64); ok {
				// Converted from int64 to float64
				f = float64(vInt)
				ok = true
			}

			if ok {
				// Assign a pointer to the actual value
				valuePtr = &f
			}
		}
		// If v was nil, valuePtr remains nil, which results in JSON null.

		// Create a new data point
		dataPoint := models.DataPoint{
			Time:  timestamp,
			Value: valuePtr, // This will be nil if the point was empty (JSON null)
		}

		// Append the data point to the correct metric slice
		response.Readings[metricName] = append(response.Readings[metricName], dataPoint)
	}

	if result.Err() != nil {
		return nil, fmt.Errorf("query processing error: %w", result.Err())
	}

	// Return the single, populated response in a slice
	return []models.ConsumptionQueryResponse{response}, nil
}

// createMetricFilterClause creates a combined filter string for multiple metrics.
func createMetricFilterClause(metrics []string) string {
	fieldFilters := make([]string, len(metrics))
	for i, metric := range metrics {
		fieldFilters[i] = fmt.Sprintf(`r["_field"] == "%s"`, metric)
	}
	return strings.Join(fieldFilters, " or ")
}
