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

// CheckLocationAccess verifies if the user has access to a given location
func CheckLocationAccess(token string, locationID string) (bool, error) {
	client := resty.New()
	log.Printf("CheckLocationAccess called with locationID: %s", locationID)
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

// CheckDeviceRightsMiddleware is a middleware that verifies user access to a device using CheckDeviceRights
func CheckDeviceRightsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tokenHeader := r.Header.Get("Authorization")
		log.Printf("CheckDeviceRightsMiddleware invoked for %s %s", r.Method, r.URL.Path)

		vars := mux.Vars(r)
		deviceID := vars["deviceID"]
		if deviceID == "" {
			// Fallback to query parameter if not in URL vars, depending on the route's structure
			deviceID = r.URL.Query().Get("deviceID")
		}

		if deviceID == "" {
			http.Error(w, "Missing deviceID in URL path or query", http.StatusBadRequest)
			log.Printf("Missing deviceID in URL path or query")
			return
		}

		// resty request to check device rights
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
		var result AccessCheckResponse
		err = json.Unmarshal(resp.Body(), &result)
		if err == nil {
			allowed = result.Allowed
		} else {
			body := strings.TrimSpace(string(resp.Body()))
			allowed = strings.Contains(body, "Access granted")
		}

		if !allowed {
			http.Error(w, "Insufficient device rights", http.StatusForbidden)
			log.Printf("Insufficient device rights for deviceID: %s", deviceID)
			return
		}
		next.ServeHTTP(w, r)
	})
}
func CheckUserDeviceRightsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tokenHeader := r.Header.Get("Authorization")
		log.Printf("CheckDeviceRightsMiddleware invoked for %s %s", r.Method, r.URL.Path)

		deviceID := r.URL.Query().Get("device_id")

		if deviceID == "" {
			http.Error(w, "Missing deviceID in URL path or query", http.StatusBadRequest)
			log.Printf("Missing deviceID in URL path or query")
			return
		}

		// resty request to check device rights
		client := resty.New()
		url := fmt.Sprintf("%s/devices/check-user-device/%s", os.Getenv("API_URL"), deviceID)
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
		var result AccessCheckResponse
		err = json.Unmarshal(resp.Body(), &result)
		if err == nil {
			allowed = result.Allowed
		} else {
			body := strings.TrimSpace(string(resp.Body()))
			allowed = strings.Contains(body, "Access granted")
		}

		if !allowed {
			http.Error(w, "Insufficient device rights", http.StatusForbidden)
			log.Printf("Insufficient device rights for deviceID: %s", deviceID)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// CheckLocationAndDeviceAccess is a middleware that verifies user access to both location and device
func CheckLocationAndDeviceAccess(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tokenHeader := r.Header.Get("Authorization")
		deviceID := mux.Vars(r)["deviceID"]
		locationID := mux.Vars(r)["locationID"]

		log.Println("Checking access for device:", deviceID, "and location:", locationID)

		// Use the logic from CheckDeviceRights
		client := resty.New()
		url := fmt.Sprintf("%s/devices/check-device-location-rights/%s/%s", os.Getenv("API_URL"), deviceID, locationID)
		resp, err := client.R().
			SetHeader("Authorization", tokenHeader).
			Get(url)
		log.Println("CheckDeviceRight request URL:", url)
		log.Printf("CheckDeviceRight response: %s", resp.Body())

		var allowed bool
		var result AccessCheckResponse
		err = json.Unmarshal(resp.Body(), &result)
		if err == nil {
			allowed = result.Allowed
		} else {
			body := strings.TrimSpace(string(resp.Body()))
			allowed = strings.Contains(body, "Access granted")
		}

		if !allowed {
			http.Error(w, "Insufficient device rights", http.StatusForbidden)
			log.Printf("Insufficient device rights for deviceID: %s", deviceID)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func CheckUserRights(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tokenHeader := r.Header.Get("Authorization")
		deviceID := r.URL.Query().Get("device_id")
		locationID := r.URL.Query().Get("location_id")
		log.Println("Checking access for device:", deviceID, "and location:", locationID)

		// Use the logic from CheckDeviceRights
		client := resty.New()
		url := fmt.Sprintf("%s/devices/check-user-rights/%s/%s", os.Getenv("API_URL"), deviceID, locationID)
		resp, err := client.R().
			SetHeader("Authorization", tokenHeader).
			Get(url)
		log.Println("CheckDeviceRight request URL:", url)
		log.Printf("CheckDeviceRight response: %s", resp.Body())

		var allowed bool
		var result AccessCheckResponse
		err = json.Unmarshal(resp.Body(), &result)
		if err == nil {
			allowed = result.Allowed
		} else {
			body := strings.TrimSpace(string(resp.Body()))
			allowed = strings.Contains(body, "Access granted")
		}

		if !allowed {
			http.Error(w, "Insufficient device rights", http.StatusForbidden)
			log.Printf("Insufficient device rights for deviceID: %s", deviceID)
			return
		}

		next.ServeHTTP(w, r)
	})
}
