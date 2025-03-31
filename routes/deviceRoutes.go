package routes

import (
	"CapIot.influxDB/controllers"
	"CapIot.influxDB/utils"
	"github.com/gorilla/mux"
	"net/http"
)

// SetupDeviceRoutes registers API routes
func SetupDeviceRoutes(router *mux.Router) {
	// Existing routes
	router.HandleFunc("/write", controllers.WriteData).Methods("POST")
	router.Handle("/devices/{location_id}", utils.JWTMiddleware(http.HandlerFunc(controllers.GetDevices))).Methods("GET")

	// New route for storing TPM 2.0 public key
	router.HandleFunc("/devices/{device_id}/tpm2/public_key", controllers.StoreTPM2PublicKey).Methods("POST")
}
