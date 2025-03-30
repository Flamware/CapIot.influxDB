package routes

import (
	"CapIot.influxDB/controllers"
	"CapIot.influxDB/utils"
	"github.com/gorilla/mux"
	"net/http"
)

// SetupLocationRoutes defines the routes for location-related operations
func SetupLocationRoutes(router *mux.Router) {
	router.Handle("/locations", utils.EnsureValidToken(http.HandlerFunc(controllers.GetLocations))).Methods("GET")
}
