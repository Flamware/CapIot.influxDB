package services

import (
	"CapIot.influxDB/dao"
	"fmt"
	"log"
)

// GetBuckets retrieves all available bucket names
func GetBuckets() ([]string, error) {
	return dao.GetBuckets()
}

// CreateBucket creates a new bucket within the specified organization
func CreateBucket(orgName, bucketName string) error {
	// Call the DAO layer to create the bucket
	err := dao.CreateBucket(orgName, bucketName)
	if err != nil {
		log.Printf("❌ Failed to create bucket: %v", err)
		return fmt.Errorf("failed to create bucket '%s': %w", bucketName, err)
	}

	log.Printf("✅ Bucket '%s' created successfully in org '%s'.", bucketName, orgName)
	return nil
}
