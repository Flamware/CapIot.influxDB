package config

import (
	"context"
	"fmt"
	"github.com/go-redis/redis/v8"
	"log"
	"time"
)

var redisClient *redis.Client

// InitRedis initializes the Redis client and connects to the Redis server.
func InitRedis() error {
	// Connect to Redis
	client := redis.NewClient(&redis.Options{
		Addr:     "localhost:6379", // Redis server address
		Password: "",               // No password by default (set password if necessary)
		DB:       0,                // Default DB
	})

	// Test the Redis connection
	_, err := client.Ping(context.Background()).Result()
	if err != nil {
		log.Println("Could not connect to Redis:", err)
		return err
	}

	// Store the Redis client in a global variable
	redisClient = client
	log.Println("Connected to Redis successfully!")
	return nil
}

// Store the public key for a device in Redis with a TTL (Time To Live)
func StorePublicKey(deviceID string, publicKey string, ttl time.Duration) error {
	if redisClient == nil {
		return fmt.Errorf("Redis client is not initialized")
	}

	// Define the Redis key to store the public key (device-specific)
	key := fmt.Sprintf("device:%s:public_key", deviceID)

	// Store the public key with the given TTL (expiration time)
	err := redisClient.Set(context.Background(), key, publicKey, ttl).Err()
	return err
}

// Get the public key for a device from Redis
func getPublicKey(deviceID string) (string, error) {
	if redisClient == nil {
		return "", fmt.Errorf("Redis client is not initialized")
	}

	key := fmt.Sprintf("device:%s:public_key", deviceID)
	publicKey, err := redisClient.Get(context.Background(), key).Result()
	if err != nil {
		if err == redis.Nil {
			return "", fmt.Errorf("public key not found for device: %s", deviceID)
		}
		return "", err
	}

	return publicKey, nil
}
