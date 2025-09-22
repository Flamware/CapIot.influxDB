package service

import (
	"CapIot.influxDB/internal/models"     // Use your actual module name
	"CapIot.influxDB/internal/repository" // Use your actual module name
	"context"
	"fmt"
	"log"
)

// DataService handles the business logic for processing sensor data.
type DataService struct {
	repo repository.Repository
}

// NewDataService creates a new DataService.
func NewDataService(repo repository.Repository) *DataService { // Changed argument type
	return &DataService{
		repo: repo,
	}
}

// ProcessAndSaveSensorData processes the incoming sensor data and saves it.
func (s *DataService) ProcessAndSaveSensorData(ctx context.Context, data models.SensorData) error {
	// Validation: Check for device ID. It's good to have a device ID.
	if data.DeviceID == "" {
		return fmt.Errorf("device_id is required")
	}
	// It's ok if some sensor values are zero, but you might want to log if all are.

	// Use the location from the sensor data as the bucket name.
	bucketName := data.Location

	// Check if the bucket exists.
	bucketExists, err := s.repo.BucketExists(ctx, bucketName)
	if !bucketExists {
		err := s.repo.CreateBucket(ctx, bucketName)
		if err != nil {
			return fmt.Errorf("failed to create bucket: %w", err)
		}
	}

	// Create the bucket if it doesn't exist.
	if !bucketExists {
		log.Printf("Bucket '%s' does not exist, creating it.\n", bucketName)
		err = s.repo.CreateBucket(ctx, bucketName) // You'll need to add this method to your repository.
		if err != nil {
			return fmt.Errorf("error creating bucket '%s': %w", bucketName, err)
		}
		log.Printf("Bucket '%s' created successfully.\n", bucketName)
	}

	// Now write the sensor data.
	return s.repo.WriteSensorData(ctx, data)
}

func (s *DataService) GetData(req models.QueryRequest) ([]models.SensorQueryResponse, error) {

	data, err := s.repo.Query(req)
	if err != nil {
		return nil, fmt.Errorf("error querying data: %w", err)
	}
	return data, nil
}

func (s *DataService) SaveConsumptionData(ctx context.Context, req models.ConsumptionReq) error {
	// Validation: Check for device ID. It's good to have a device ID.
	if req.DeviceID == "" {
		return fmt.Errorf("device_id is required")
	}
	// It's ok if some sensor values are zero, but you might want to log if all are.

	// Use a fixed bucket name for consumption data.
	bucketName := "consumption_data"

	// Check if the bucket exists.
	bucketExists, err := s.repo.BucketExists(ctx, bucketName)
	if !bucketExists {
		err := s.repo.CreateBucket(ctx, bucketName)
		if err != nil {
			return fmt.Errorf("failed to create bucket: %w", err)
		}
	}

	// Create the bucket if it doesn't exist.
	if !bucketExists {
		log.Printf("Bucket '%s' does not exist, creating it.\n", bucketName)
		err = s.repo.CreateBucket(ctx, bucketName) // You'll need to add this method to your repository.
		if err != nil {
			return fmt.Errorf("error creating bucket '%s': %w", bucketName, err)
		}
		log.Printf("Bucket '%s' created successfully.\n", bucketName)
	}

	// Now write the consumption data.
	return s.repo.WriteConsumptionData(ctx, req)
}

func (s *DataService) GetConsumptionData(ctx context.Context, req models.ConsumptionQueryRequest) ([]models.ConsumptionQueryResponse, error) {
	if req.DeviceID == "" {
		return nil, fmt.Errorf("device_id is required")
	}

	// Default to all metrics if empty
	if len(req.Metrics) == 0 {
		req.Metrics = []string{"current", "voltage", "power"}
	}

	// Build the query for your repository layer
	data, err := s.repo.QueryConsumptionData(ctx, req.DeviceID, req.Metrics, req.TimeRangeStart, req.TimeRangeStop)
	if err != nil {
		return nil, fmt.Errorf("error querying consumption data: %w", err)
	}

	return data, nil
}
