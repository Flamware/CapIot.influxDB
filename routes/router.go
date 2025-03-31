// File: routes/router.go
package routes

import (
	"CapIot.influxDB/controllers"
	"CapIot.influxDB/utils"
	"github.com/gorilla/mux"
	"net/http"
)

// SetupRouter defines all API routes.
func SetupRouter() *mux.Router {
	router := mux.NewRouter()

	router.Handle("/write", utils.CombinedAuthMiddleware(http.HandlerFunc(controllers.WriteData))).Methods("POST")
	SetupLocationRoutes(router)
	SetupDeviceRoutes(router)

	return router
}
