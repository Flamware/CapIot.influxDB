package middleware

import (
	"encoding/json"
	"fmt"
	"github.com/go-resty/resty/v2"
	"github.com/gorilla/mux"
	"log"
	"net/http"
	"os"
	"strings"
)

// Response structure from Mongo API
type AccessCheckResponse struct {
	Allowed bool `json:"allowed"`
}

// CheckDeviceAccess verifies if the user has access to a given device
func CheckDeviceAccess(token string, deviceID string) (bool, error) {
	client := resty.New()
	url := fmt.Sprintf("%s/check-device-access/%s", os.Getenv("API_URL"), deviceID)
	resp, err := client.R().
		SetHeader("Authorization", token).
		Get(url)
	log.Println("CheckDeviceAccess request URL:", url)
	log.Printf("CheckDeviceAccess response: %s", resp.Body())
	if err != nil {
		return false, err
	}

	var result AccessCheckResponse
	err = json.Unmarshal(resp.Body(), &result)
	if err != nil {
		return false, err
	}

	return result.Allowed, nil
}

// CheckLocationAccess verifies if the user has access to a given location
func CheckLocationAccess(token string, locationID string) (bool, error) {
	client := resty.New()
	url := fmt.Sprintf("%s/check-location-access/%s", os.Getenv("API_URL"), locationID)
	resp, err := client.R().
		SetHeader("Authorization", token).
		Get(url)
	log.Println("CheckLocationAccess request URL:", url)
	log.Printf("CheckLocationAccess response: %s", resp.Body())
	if err != nil {
		return false, err
	}

	var result AccessCheckResponse
	err = json.Unmarshal(resp.Body(), &result)
	if err != nil {
		return false, err
	}

	return result.Allowed, nil
}

// CheckDeviceAccessMiddleware is a middleware that verifies user access to a device
func CheckDeviceAccessMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tokenHeader := r.Header.Get("Authorization")
		deviceID := r.URL.Query().Get("deviceID")

		allowed, err := CheckDeviceAccess(tokenHeader, deviceID)
		if err != nil || !allowed {
			http.Error(w, "Access denied for device", http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// CheckLocationAccessMiddleware is a middleware that verifies user access to a location
func CheckLocationAccessMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tokenHeader := r.Header.Get("Authorization")
		locationID := r.URL.Query().Get("locationID")

		allowed, err := CheckLocationAccess(tokenHeader, locationID)
		if err != nil || !allowed {
			http.Error(w, "Access denied for location", http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// CheckLocationAndDeviceAccess is a middleware that verifies user access to both location and device
func CheckLocationAndDeviceAccess(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tokenHeader := r.Header.Get("Authorization")
		deviceID := r.URL.Query().Get("deviceID")
		locationID := r.URL.Query().Get("locationID")

		log.Println("Checking access for device:", deviceID, "and location:", locationID)

		deviceAllowed, err := CheckDeviceAccess(tokenHeader, deviceID)
		if err != nil || !deviceAllowed {
			http.Error(w, "Access denied for device", http.StatusForbidden)
			return
		}

		locationAllowed, err := CheckLocationAccess(tokenHeader, locationID)
		if err != nil || !locationAllowed {
			http.Error(w, "Access denied for location", http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func CheckDeviceRights(handlerFunc http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tokenHeader := r.Header.Get("Authorization")
		log.Printf("CheckDeviceRights middleware invoked for %s %s", r.Method, r.URL.Path)
		// Use mux.Vars to extract deviceID from the URL path, not a query parameter
		vars := mux.Vars(r)
		log.Printf("URL Vars: %+v", vars)
		deviceID := vars["deviceID"]
		if deviceID == "" {
			http.Error(w, "Missing deviceID in URL path", http.StatusBadRequest)
			log.Printf("Missing deviceID in URL path")
			return
		}

		// resty request to check device right
		client := resty.New()
		url := fmt.Sprintf("%s/devices/check-device-rights/%s", os.Getenv("API_URL"), deviceID)
		resp, err := client.R().
			SetHeader("Authorization", tokenHeader).
			Get(url)
		log.Println("CheckDeviceRight request URL:", url)
		log.Printf("CheckDeviceRight response: %s", resp.Body())
		if err != nil {
			http.Error(w, "Error checking device rights", http.StatusInternalServerError)
			log.Printf("Error checking device rights: %v", err)
			return
		}

		// Handle both JSON and plain-text responses
		var allowed bool

		// First, try to unmarshal as JSON
		var result AccessCheckResponse
		err = json.Unmarshal(resp.Body(), &result)
		if err == nil {
			// JSON parsing was successful
			allowed = result.Allowed
		} else {
			// JSON parsing failed, treat as plain text
			body := string(resp.Body())
			allowed = strings.Contains(body, "Access granted")
		}

		if !allowed {
			http.Error(w, "Insufficient device rights", http.StatusForbidden)
			log.Printf("Insufficient device rights for deviceID: %s", deviceID)
			return
		}
		handlerFunc(w, r)
	}
}
