// internal/repository/InfluxDBRepository.go

package repository

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"CapIot.influxDB/internal/models" // Use your actual module name
	influxdb2 "github.com/influxdata/influxdb-client-go/v2"
	"github.com/influxdata/influxdb-client-go/v2/api/write"
)

// Repository Interface
type Repository interface {
	WriteSensorData(ctx context.Context, data models.SensorData) error
	BucketExists(ctx context.Context, name string) (bool, error)
	CreateBucket(ctx context.Context, name string) error
	Query(query models.QueryRequest) ([]models.SensorQueryResponse, error)
	WriteConsumptionData(ctx context.Context, req models.ConsumptionReq) error
	QueryConsumptionData(ctx context.Context, id string, metrics []string, start string, stop string) ([]models.ConsumptionQueryResponse, error)
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
		if err.Error() == "not found" { // Check the error message
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

	locationID, err := strconv.Atoi(req.LocationID)
	if err != nil {
		return nil, fmt.Errorf("invalid locationId: %w", err)
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
		from(bucket: "%d")
		%s
		|> filter(fn: (r) => r["_measurement"] == "sensor_data")
		|> filter(fn: (r) => r["device_id"] == "%s")
		|> filter(fn: (r) => %s)
		|> aggregateWindow(every: %s, fn: mean, createEmpty: false)
		|> yield(name: "mean")
	`, locationID, rangeClause, req.DeviceID, fieldFilterClause, req.WindowPeriod)
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
		if loc, ok := record.ValueByKey("location").(string); ok {
			locationIDStr = loc
		}

		var field string
		if f, ok := record.ValueByKey("_field").(string); ok {
			field = f
		}
		if value, ok := record.ValueByKey("_value").(float64); ok {
			reading["value"] = value
		} else if valueInt, ok := record.ValueByKey("_value").(int64); ok {
			reading["value"] = float64(valueInt)
		}

		if _, ok := groupedData[deviceID]; !ok {
			groupedData[deviceID] = make(map[string]map[string][]map[string]interface{})
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
	// Format the grouped data into the SensorQueryResponse model
	var response []models.SensorQueryResponse
	for deviceID, locationMap := range groupedData {
		for _, fieldMap := range locationMap { // We don't need the locationID here anymore
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
func (r *InfluxDBRepository) QueryConsumptionData(ctx context.Context, id string, metrics []string, start string, stop string) ([]models.ConsumptionQueryResponse, error) {
	queryAPI := r.client.QueryAPI(r.org)

	if start == "" || stop == "" {
		return nil, fmt.Errorf("time range start and stop must be provided")
	}

	// Build Flux query
	fluxQuery := fmt.Sprintf(`
       from(bucket: "%s")
       |> range(start: %s, stop: %s)
       |> filter(fn: (r) => r["_measurement"] == "consumption_data")
       |> filter(fn: (r) => r["device_id"] == "%s")
       |> filter(fn: (r) => %s)
       |> aggregateWindow(every: 1m, fn: mean, createEmpty: false)
       |> yield(name: "mean")
    `, "consumption_data", start, stop, id, createMetricFilterClause(metrics))
	log.Printf("Executing InfluxDB consumption query: %s", fluxQuery)

	// Execute query
	result, err := queryAPI.Query(ctx, fluxQuery)
	if err != nil {
		log.Printf("Error querying InfluxDB: %v\nQuery: %s", err, fluxQuery)
		return nil, fmt.Errorf("error querying InfluxDB: %w", err)
	}

	// Prepare the final response structure
	response := models.ConsumptionQueryResponse{
		DeviceID: id,
		Readings: make(map[string][]models.DataPoint),
	}

	for result.Next() {
		record := result.Record()
		metricName := record.Field()
		timestamp := record.Time()
		value, ok := record.Value().(float64)
		if !ok {
			log.Printf("Skipping non-float64 value for metric %s", metricName)
			continue
		}

		// Create a new data point
		dataPoint := models.DataPoint{
			Time:  timestamp,
			Value: value,
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
