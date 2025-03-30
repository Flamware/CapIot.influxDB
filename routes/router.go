package routes

import (
	"CapIot.influxDB/controllers"
	"CapIot.influxDB/utils"
	"github.com/gorilla/mux"
	"net/http"
)

// SetupRouter defines all the routes for the API
func SetupRouter() *mux.Router {
	router := mux.NewRouter()

	router.Handle("/write", utils.EnsureValidToken(http.HandlerFunc(controllers.WriteData))).Methods("POST")

	// Register sub-routes
	SetupLocationRoutes(router)
	SetupDeviceRoutes(router)

	return router
}
