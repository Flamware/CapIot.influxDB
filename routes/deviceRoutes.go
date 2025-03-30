package routes

import (
	"CapIot.influxDB/controllers"
	"CapIot.influxDB/utils"
	"github.com/gorilla/mux"
	"net/http"
)

// SetupDeviceRoutes registers API routes
func SetupDeviceRoutes(router *mux.Router) {
	router.HandleFunc("/write", controllers.WriteData).Methods("POST")
	router.Handle("/devices/{location_id}", utils.EnsureValidToken(http.HandlerFunc(controllers.GetDevices))).Methods("GET")
}
