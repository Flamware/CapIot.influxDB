package routes

import (
	"CapIot.influxDB/internal/controller"
	"CapIot.influxDB/internal/middleware"
	"fmt"
	"github.com/gorilla/mux"
	"net/http"
)

// RegisterRoutes registers all application routes
func RegisterRoutes(router *mux.Router, controller *controller.DataController) {
	// Sensor data - GET and POST are handled separately to apply different middleware.
	router.Handle("/influxdb/sensordata/{deviceID}/{locationID}",
		middleware.CheckLocationAndDeviceAccess(http.HandlerFunc(controller.HandleQueryData))).Methods(http.MethodGet)

	router.Handle("/influxdb/sensordata/{deviceID}/{locationID}",
		middleware.CheckDeviceRights(http.HandlerFunc(controller.HandleSensorData))).Methods(http.MethodPost)

	// Consumption data - GET and POST are handled separately.
	router.Handle("/influxdb/metrics/{deviceID}",
		middleware.CheckDeviceAccessMiddleware(http.HandlerFunc(controller.HandleGetConsumptionData))).Methods(http.MethodGet)

	router.Handle("/influxdb/metrics/{deviceID}",
		middleware.CheckDeviceRights(http.HandlerFunc(controller.HandleConsumptionData))).Methods(http.MethodPost)

	// Device provisioning endpoint
	router.HandleFunc("/influxdb/provisioning", controller.HandleProvisioning).Methods(http.MethodPost)

	// Health check
	router.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, "OK")
	}).Methods(http.MethodGet)

	//print all registered routes
	err := router.Walk(func(route *mux.Route, router *mux.Router, ancestors []*mux.Route) error {
		pathTemplate, err := route.GetPathTemplate()
		if err != nil {
			return err
		}
		methods, err := route.GetMethods()
		if err != nil {
			return err
		}
		fmt.Printf("Registered route: %s %v\n", pathTemplate, methods)
		return nil
	})
	if err != nil {
		fmt.Printf("Error walking routes: %v\n", err)
	}
}
