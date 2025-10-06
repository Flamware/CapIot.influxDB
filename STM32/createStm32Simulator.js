const mqtt = require('mqtt');
const winston = require('winston');
const moment = require('moment');

// Importation des services modulaires
const mqttService = require('./mqttService');
const dataService = require('./dataService');
const handleSchedule = require('./handleSchedule');
const { getProvisioningToken } = require("./auth");

/**
 * @typedef {Object} Schedule
 * @property {string} recurring_schedule_id - Unique ID for the schedule.
 * @property {string} device_id - ID of the device this schedule applies to.
 * @property {string} start_time - Start time in HH:mm:ss format.
 * @property {string} end_time - End time in HH:mm:ss format.
 * @property {string} recurrence_rule - Recurrence rule (e.g., "FREQ=WEEKLY;BYDAY=MO,WE,FR").
 */

/**
 * @typedef {Object} Component
 * @property {string} component_id - Unique ID for the component (e.g., "stm32-temp-sim-001").
 * @property {string} component_name - Human-readable name (e.g., "temp-sim-001").
 * @property {string} component_type - Category of the component (e.g., "sensor", "actuator").
 * @property {string} [component_subtype] - More specific type (e.g., "temperature", "fan").
 * @property {string} [component_status] - Current operational status (e.g., "ok", "warning", "fault").
 * @property {number} [currentValue] - Current simulated value for sensors.
 * @property {number} [variance] - Randomness factor for data generation.
 * @property {number} [min_threshold] - Minimum acceptable value for a sensor.
 * @property {number} [max_threshold] - Maximum acceptable value for a sensor.
 * @property {number} [max_running_hours] - Maximum running hours before maintenance is needed.
 * @property {number} [current_running_hours] - Accumulated running hours.
 * @property {string} [device_id] - ID of the parent device.
 */

/**
 * Creates and manages a single device simulator.
 *
 * @param {string} deviceID The unique ID for the device.
 */
async function createStm32Simulator(deviceID) {
    // Logger configuration for this specific device
    const logger = winston.createLogger({
        level: 'info',
        format: winston.format.combine(winston.format.timestamp(), winston.format.printf(({
                                                                                              timestamp,
                                                                                              level,
                                                                                              message
                                                                                          }) => {
            return `${timestamp} [${level.toUpperCase()}] ${message}`;
        })),
        transports: [new winston.transports.Console(), new winston.transports.File({
            filename: `${deviceID}.log`
        })],
    });

    // MQTT config
    const mqttBroker = 'mqtt://localhost:1883';
    const availabilityTopic = `devices/available/${deviceID}`;
    const statusTopic = `devices/status/${deviceID}`;
    const heartbeatTopic = `devices/heartbeat/${deviceID}`;
    const configTopic = `devices/config/${deviceID}`;
    const commandsTopic = `devices/commands/${deviceID}`;
    const alertTopicBase = `devices/alert`;
    const runningHoursTopic = `devices/running_hours/${deviceID}`;
    const scheduleTopic = `devices/schedules/${deviceID}`;
    const consumptionTopic = `devices/consumption/${deviceID}`;
    const registeredTopic = `devices/registered/${deviceID}`;
    const provisioningUrl = "http://localhost:8000/influxdb/provisioning";
    // Simulation rate
    const SIMULATION_SECONDS_PER_HOUR = 1;
    const DATA_PUBLISH_INTERVAL_MS = 5000;
    const SIMULATED_HOURS_PER_INTERVAL = DATA_PUBLISH_INTERVAL_MS / 1000 / SIMULATION_SECONDS_PER_HOUR;

    // Components with new naming and component_id generation
    const components = [{
        component_name: 'temp-sim-001',
        component_type: 'sensor',
        component_subtype: 'temperature',
        component_status: 'ok',
        currentValue: 20 + Math.random() * 15,
        variance: 0.5,
        current_running_hours: 0,
    }, {
        component_name: 'hum-sim-001',
        component_type: 'sensor',
        component_subtype: 'humidity',
        component_status: 'ok',
        currentValue: 40 + Math.random() * 40,
        variance: 2,
        current_running_hours: 0,
    }, {
        component_name: 'fan-sim-001',
        component_type: 'actuator',
        component_subtype: 'fan',
        component_status: 'fault',
        speed: 0,
        current_running_hours: 0,
    }, {
        component_name: 'led-sim-001',
        component_type: 'indicator',
        component_subtype: 'LED',
        component_status: 'warning',
        current_running_hours: 0,
    }];

    components.forEach(comp => {
        comp.component_id = `${deviceID}-${comp.component_name}`;
        comp.device_id = deviceID;
    });

    let deviceLocation = '';
    let monitoringLocationId = null;
    let deviceStatus = 'offline';
    let isFollowingSchedule = false;
    let deviceSchedules = [];

    let heartbeatInterval;
    let dataMonitoringInterval;
    let consumptionInterval;
    let scheduleCheckInterval;

    const connectOptions = {
        clientId: deviceID,
        username: 'admin',
        password: 'admin',
        will: {
            topic: statusTopic,
            payload: JSON.stringify({
                device_id: deviceID,
                status: 'offline',
                timestamp: moment().toISOString()
            }),
            qos: 1,
            retain: true,
        },
    };

    const client = mqtt.connect(mqttBroker, connectOptions);

    /**
     * Publishes a configuration alert message with a specific component ID.
     * @param {string} componentId The ID of the component with the configuration error.
     * @param {string} message The detailed alert message.
     */
    function publishConfigurationAlert(componentId, message) {
        const alertPayload = {
            device_id: deviceID,
            component_id: componentId,
            alert: message,
            timestamp: new Date().toISOString()
        };
        const alertTopic = `${alertTopicBase}/${deviceID}`;
        client.publish(alertTopic, JSON.stringify(alertPayload), {
            qos: 1
        });
        logger.error(`CONFIGURATION ALERT for ${componentId}: ${message}`);
    }

    /**
     * Checks all components for configuration errors and publishes alerts.
     * @returns {boolean} True if all components have a complete configuration, false otherwise.
     */
    function hasCompleteConfiguration() {
        for (const comp of components) {
            if (!comp.max_running_hours) {
                publishConfigurationAlert(comp.component_id, `Configuration incomplete: Component is missing 'max_running_hours'.`);
                return false;
            }
            if (comp.component_type === 'sensor' && (comp.min_threshold === undefined || comp.max_threshold === undefined)) {
                publishConfigurationAlert(comp.component_id, `Configuration incomplete: Sensor is missing 'min_threshold' or 'max_threshold'.`);
                return false;
            }
        }
        return true;
    }

    /**
     * Starts the device simulator's data monitoring and consumption intervals.
     */
    function startDevice() {
        if (!hasCompleteConfiguration()) {
            return;
        }

        if (deviceStatus === 'running' || deviceStatus === 'running_plan') {
            return;
        }

        logger.info(`${deviceID} Starting data monitoring and consumption.`);

        // Clear any existing intervals to prevent duplication
        if (dataMonitoringInterval) clearInterval(dataMonitoringInterval);
        if (consumptionInterval) clearInterval(consumptionInterval);

        // Start sending component data
        dataMonitoringInterval = setInterval(() => {
            dataService.publishComponentData(client, deviceID, deviceLocation, components, SIMULATED_HOURS_PER_INTERVAL, alertTopicBase, runningHoursTopic);
        }, DATA_PUBLISH_INTERVAL_MS);

        // Start sending power consumption data
        consumptionInterval = setInterval(() => {
            dataService.publishConsumptionData(client, deviceID, consumptionTopic);
        }, DATA_PUBLISH_INTERVAL_MS);
    }

    /**
     * Stops all active simulator intervals and updates the device status.
     * @param {string} newStatus The new status to set after stopping.
     */
    function stopDevice(newStatus) {
        if (dataMonitoringInterval) {
            clearInterval(dataMonitoringInterval);
            dataMonitoringInterval = null;
        }
        if (consumptionInterval) {
            clearInterval(consumptionInterval);
            consumptionInterval = null;
        }

        deviceStatus = newStatus;
        mqttService.publishDeviceStatus(client, deviceID, statusTopic, newStatus, false);
        logger.info(`${deviceID} stopped. Status set to '${newStatus}'.`);
    }

    client.on('connect', () => {
        logger.info(`${deviceID} connected to MQTT broker`);
        // Publish availability and status immediately upon connect
        mqttService.publishAvailability(client, deviceID, availabilityTopic, components, 'online');
        mqttService.publishDeviceStatus(client, deviceID, statusTopic, 'online', true);

        // Subscribe to relevant topics
        client.subscribe(configTopic, { qos: 1 });
        client.subscribe(commandsTopic, { qos: 1 });
        client.subscribe(scheduleTopic, { qos: 1 });
        client.subscribe(registeredTopic, { qos: 1 });
    });

    client.on('message', (topic, message) => {
        const payloadString = message.toString();
        try {
            const payload = JSON.parse(payloadString);
            logger.info(`${deviceID} Message received on ${topic}: ${payloadString}`);

            switch (topic) {
                case registeredTopic:
                    getProvisioningToken(deviceID,provisioningUrl).then(token => {
                        if (token) {
                            // Store the token for future use
                            dataService.setAuthToken(token);
                            authToken = token; // Set the global authToken variable
                            logger.info(`${deviceID} Provisioning token received and stored.`);
                        } else {
                            logger.error(`${deviceID} Failed to obtain provisioning token.`);
                        }
                    }).catch(error => {
                        logger.error(`${deviceID} Error obtaining provisioning token: ${error.message}`);
                    });
                    logger.info(`${deviceID} has been registered by the server. Starting operations.`);
                    deviceStatus = 'online';

                    // Start the operational loops only after registration confirmation
                    heartbeatInterval = setInterval(() => {
                        mqttService.publishHeartbeat(client, deviceID, heartbeatTopic, deviceStatus);
                    }, 5000);

                    scheduleCheckInterval = setInterval(() => {
                        if (isFollowingSchedule) {
                            logger.info(`${deviceID} Checking schedule...`);
                            const shouldRun = handleSchedule(deviceSchedules);
                            if (shouldRun) {
                                startDevice();
                                deviceStatus = 'running_plan';
                                mqttService.publishDeviceStatus(client, deviceID, statusTopic, 'running_plan', false);
                                logger.info(`${deviceID} starting based on schedule.`);
                            } else {
                                stopDevice('stopped_plan');
                                logger.info(`${deviceID} stopping as it's outside of a schedule.`);
                            }
                        }
                    }, 10000);
                    break;
                case configTopic:
                    mqttService.handleDeviceConfig(components, payload);
                    break;
                case commandsTopic:
                    const { command, component_id, location_id } = payload;
                    isFollowingSchedule = false; // Manual command overrides schedule following
                    switch (command) {
                        case 'Start':
                            if (!location_id) {
                                logger.error(`${deviceID} 'Start' command received without 'location_id'.`);
                                return;
                            }
                            monitoringLocationId = location_id;
                            deviceLocation = monitoringLocationId.toString();
                            startDevice();
                            deviceStatus = 'running';
                            mqttService.publishDeviceStatus(client, deviceID, statusTopic, 'Running', false);
                            logger.info(`${deviceID} started manually.`);
                            break;
                        case 'Stop':
                            stopDevice('online');
                            break;
                        case 'Follow_Schedule':
                            isFollowingSchedule = true;
                            logger.info(`${deviceID} now following schedule plan.`);
                            const shouldRunNow = handleSchedule(deviceSchedules);
                            if (shouldRunNow) {
                                startDevice();
                                deviceStatus = 'running_plan';
                                mqttService.publishDeviceStatus(client, deviceID, statusTopic, 'running_plan', false);
                                logger.info(`${deviceID} started immediately based on the schedule.`);
                            } else {
                                stopDevice('stopped_plan');
                                logger.info(`${deviceID} stopped because the schedule says no.`);
                            }
                            break;
                        case 'reset':
                            mqttService.handleResetComponentTimer(client, deviceID, statusTopic, components, component_id);
                            break;
                        default:
                            logger.warn(`${deviceID} Unknown command received: ${command}.`);
                            break;
                    }
                    break;
                case scheduleTopic:
                    deviceSchedules = payload.schedules;
                    logger.info(`${deviceID} schedules updated. Total schedules: ${deviceSchedules.length}`);
                    if (isFollowingSchedule) {
                        const shouldRunNow = handleSchedule(deviceSchedules);
                        if (shouldRunNow) {
                            startDevice();
                            deviceStatus = 'running_plan';
                            mqttService.publishDeviceStatus(client, deviceID, statusTopic, 'running_plan', false);
                            logger.info(`${deviceID} started based on the new schedule.`);
                        } else {
                            stopDevice('stopped_plan');
                            logger.info(`${deviceID} stopped based on the new schedule.`);
                        }
                    }
                    break;
                default:
                    logger.warn(`${deviceID} Message received on unexpected topic: ${topic}.`);
                    break;
            }
        } catch (error) {
            logger.error(`${deviceID} Error parsing message on ${topic}: ${error}`);
        }
    });

    client.on('error', (error) => {
        logger.error(`${deviceID} MQTT Error: ${error}`);
    });

    client.on('close', () => {
        logger.info(`${deviceID} disconnected from MQTT broker`);
        deviceStatus = 'offline';
        monitoringLocationId = null;
        // Clear all intervals on disconnect
        if (dataMonitoringInterval) clearInterval(dataMonitoringInterval);
        if (consumptionInterval) clearInterval(consumptionInterval);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        if (scheduleCheckInterval) clearInterval(scheduleCheckInterval);
    });
}

module.exports = createStm32Simulator;
