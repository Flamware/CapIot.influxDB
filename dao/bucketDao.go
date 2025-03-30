package dao

import (
	"CapIot.influxDB/config"
	"context"
	"fmt"
	"log"
)

// GetBuckets retrieves the list of bucket names
// GetBuckets retrieves the list of bucket names excluding system buckets
func GetBuckets() ([]string, error) {
	influxClient := config.GetInfluxClient() // ✅ No circular dependency
	bucketsAPI := influxClient.BucketsAPI()
	buckets, err := bucketsAPI.GetBuckets(context.Background())
	if err != nil {
		log.Printf("Error fetching buckets: %v", err)
		return nil, err
	}

	var bucketNames []string
	for _, bucket := range *buckets {
		// Check if the bucket is not a system bucket
		if !isSystemBucket(bucket.Name) {
			bucketNames = append(bucketNames, bucket.Name)
		}
	}

	return bucketNames, nil
}

// isSystemBucket checks if the given bucket name is a system bucket
func isSystemBucket(bucketName string) bool {
	// Define system bucket names or patterns (adjust as necessary)
	systemBuckets := []string{
		"_internal", // Example of a system bucket in InfluxDB
		"_monitoring",
		"_tasks",
	}

	for _, systemBucket := range systemBuckets {
		if bucketName == systemBucket {
			return true
		}
	}

	// Additional checks for system bucket properties can be added here (e.g., retention rules)
	return false
}

// CreateBucket creates a new bucket within a specified organization
func CreateBucket(orgName, bucketName string) error {
	influxClient := config.GetInfluxClient() // ✅ Get client from config
	orgAPI := influxClient.OrganizationsAPI()

	// Find Organization
	org, err := orgAPI.FindOrganizationByName(context.Background(), orgName)
	if err != nil {
		log.Printf("Error finding organization '%s': %v", orgName, err)
		return err
	}
	if org == nil {
		return fmt.Errorf("organization '%s' not found", orgName)
	}

	// Check if bucket exists
	if BucketExists(bucketName) {
		log.Printf("Bucket '%s' already exists", bucketName)
		return nil
	}

	// Create the Bucket
	bucketsAPI := influxClient.BucketsAPI()
	_, err = bucketsAPI.CreateBucketWithName(context.Background(), org, bucketName)
	if err != nil {
		log.Printf("Error creating bucket: %v", err)
		return err
	}

	log.Printf("✅ Bucket '%s' created successfully.", bucketName)
	return nil
}

// BucketExists checks if a bucket exists in the organization
func BucketExists(bucketName string) bool {
	influxClient := config.GetInfluxClient() // ✅ Get client from config
	bucketsAPI := influxClient.BucketsAPI()
	_, err := bucketsAPI.FindBucketByName(context.Background(), bucketName)

	return err == nil // If no error, bucket exists
}
