const mqtt = require('mqtt');
const winston = require('winston');
const moment = require('moment');

// Importation des services modulaires
const mqttService = require('./mqttService');
const dataService = require('./dataService');
const handleSchedule = require('./handleSchedule');

/**
 * @typedef {Object} Schedule
 * @property {string} recurring_schedule_id - Unique ID for the schedule.
 * @property {string} device_id - ID of the device this schedule applies to.
 * @property {string} start_time - Start time in HH:mm:ss format.
 * @property {string} end_time - End time in HH:mm:ss format.
 * @property {string} recurrence_rule - Recurrence rule (e.g., "FREQ=WEEKLY;BYDAY=MO,WE,FR").
 */

/**
 * Creates and manages a single device simulator.
 *
 * @param {string} deviceID The unique ID for the device.
 */
function createStm32Simulator(deviceID) {
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

    // Simulation rate
    const SIMULATION_SECONDS_PER_HOUR = 1;
    const DATA_PUBLISH_INTERVAL_MS = 5000;
    const SIMULATED_HOURS_PER_INTERVAL = DATA_PUBLISH_INTERVAL_MS / 1000 / SIMULATION_SECONDS_PER_HOUR;

    // Components with new naming and component_id generation
    const components = [{
        component_name: 'temp-sim-001',
        component_type: 'sensor',
        component_subtype: 'temperature',
        status: 'ok',
        currentValue: 20 + Math.random() * 15,
        variance: 0.5,
        min: -5,
        max: 40,
        running_hours: 0,
    }, {
        component_name: 'hum-sim-001',
        component_type: 'sensor',
        component_subtype: 'humidity',
        status: 'ok',
        currentValue: 40 + Math.random() * 40,
        variance: 2,
        min: 0,
        max: 100,
        running_hours: 0,
    }, {
        component_name: 'fan-sim-001',
        component_type: 'actuator',
        component_subtype: 'fan',
        status: 'fault',
        speed: 0,
        running_hours: 0,
    }, {
        component_name: 'led-sim-001',
        component_type: 'indicator',
        component_subtype: 'LED',
        status: 'warning',
        running_hours: 0,
    }, ];
    components.forEach(comp => {
        comp.component_id = `${deviceID}-${comp.component_name}`;
    });

    let deviceLocation = '';
    let monitoringLocationId = null;
    let deviceStatus = 'offline';
    let isFollowingSchedule = false;
    let deviceSchedules = [];

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
    let heartbeatInterval;
    let dataMonitoringInterval;
    let scheduleCheckInterval;

    client.on('connect', () => {
        logger.info(`${deviceID} connected to MQTT broker`);
        deviceStatus = 'online';
        mqttService.publishAvailability(client, deviceID, availabilityTopic, components, deviceStatus);
        mqttService.publishDeviceStatus(client, deviceID, statusTopic, deviceStatus, true);
        client.subscribe(configTopic, {
            qos: 1
        });
        client.subscribe(commandsTopic, {
            qos: 1
        });
        client.subscribe(scheduleTopic, {
            qos: 1
        });

        heartbeatInterval = setInterval(() => {
            mqttService.publishHeartbeat(client, deviceID, heartbeatTopic, deviceStatus);
        }, 5000);
        scheduleCheckInterval = setInterval(() => {
            if (isFollowingSchedule) {
                logger.info(`${deviceID} Checking schedule...`);
                const shouldRun = handleSchedule(deviceSchedules);
                const isCurrentlyRunning = (deviceStatus === 'running' || deviceStatus === 'running_plan');

                if (shouldRun && !isCurrentlyRunning) {
                    // Start the device if it's supposed to be running but isn't
                    startDataMonitoring();
                    deviceStatus = 'running_plan';
                    mqttService.publishDeviceStatus(client, deviceID, statusTopic, 'running_plan', false);
                    logger.info(`${deviceID} starting based on schedule.`);
                } else if (!shouldRun && isCurrentlyRunning) {
                    // Stop the device if it's running but shouldn't be
                    clearInterval(dataMonitoringInterval);
                    deviceStatus = 'stopped_plan';
                    mqttService.publishDeviceStatus(client, deviceID, statusTopic, 'stopped_plan', false);
                    logger.info(`${deviceID} stopping as it's outside of a schedule.`);
                } else if (shouldRun && isCurrentlyRunning) {
                    // Log that the device remains in the correct state (running)
                    logger.info(`${deviceID} remains running as per schedule.`);
                } else if (!shouldRun && !isCurrentlyRunning) {
                    // Log that the device remains in the correct state (stopped)
                    logger.info(`${deviceID} remains stopped as per schedule.`);
                }
            }
        }, 10000);
    });

    client.on('message', (topic, message) => {
        const payloadString = message.toString();
        try {
            const payload = JSON.parse(payloadString);
            logger.info(`${deviceID} Message received on ${topic}: ${payloadString}`);

            if (topic === configTopic) {
                mqttService.handleDeviceConfig(components, payload);
            } else if (topic === commandsTopic) {
                const {
                    command,
                    component_id,
                    location_id
                } = payload;
                switch (command) {
                    case 'Start':
                        isFollowingSchedule = false;
                        if (location_id) {
                            monitoringLocationId = location_id;
                            deviceLocation = monitoringLocationId.toString();
                            if (deviceStatus !== 'running') {
                                startDataMonitoring();
                                deviceStatus = 'running';
                                mqttService.publishDeviceStatus(client, deviceID, statusTopic, 'Running', false);
                                logger.info(`${deviceID} started manually.`);
                            }
                        } else {
                            logger.error(`${deviceID} 'Start' command received without 'location_id'.`);
                        }
                        break;
                    case 'Stop':
                        isFollowingSchedule = false;
                        if (dataMonitoringInterval) {
                            clearInterval(dataMonitoringInterval);
                            monitoringLocationId = null;
                            if (deviceStatus === 'running' || deviceStatus === 'running_plan') {
                                deviceStatus = 'online';
                                mqttService.publishDeviceStatus(client, deviceID, statusTopic, 'Online', false);
                                logger.info(`${deviceID} stopped manually.`);
                            }
                        } else {
                            logger.info(`${deviceID} already stopped.`);
                        }
                        break;
                    case 'Follow_Schedule':
                        isFollowingSchedule = true;
                        logger.info(`${deviceID} now following schedule plan.`);

                        const shouldRunNow = handleSchedule(deviceSchedules);
                        const isCurrentlyRunning = (deviceStatus === 'running' || deviceStatus === 'running_plan');

                        if (shouldRunNow) {
                            if (!isCurrentlyRunning) {
                                startDataMonitoring();
                                deviceStatus = 'running_plan';
                                mqttService.publishDeviceStatus(client, deviceID, statusTopic, 'running_plan', false);
                                logger.info(`${deviceID} started immediately based on the schedule.`);
                            } else {
                                logger.info(`${deviceID} is already running, no change needed.`);
                            }
                        } else {
                            // The schedule says no, and the device should stop or stay stopped
                            if (isCurrentlyRunning) {
                                clearInterval(dataMonitoringInterval);
                                logger.info(`${deviceID} stopped because the schedule says no.`);
                            }
                            deviceStatus = 'stopped_plan';
                            mqttService.publishDeviceStatus(client, deviceID, statusTopic, 'stopped_plan', false);
                        }
                        break;
                    case 'Reset':
                        mqttService.handleResetComponentTimer(client, deviceID, statusTopic, components, component_id);
                        break;
                    case 'Set_Hours':
                        const {
                            hours
                        } = payload;
                        if (component_id && typeof hours === 'number' && hours >= 0) {
                            mqttService.handleSetComponentHours(client, deviceID, statusTopic, components, component_id, hours);
                        } else {
                            logger.error(`${deviceID} Invalid 'set_hours' command. Ensure 'component_id' and 'hours' are provided and valid.`);
                        }
                        break;
                    default:
                        logger.warn(`${deviceID} Unknown command received: ${command}.`);
                        break;
                }
            } else if (topic === scheduleTopic) {
                deviceSchedules = payload.schedules;
                logger.info(`${deviceID} schedules updated. Total schedules: ${deviceSchedules.length}`);

                if (isFollowingSchedule) {
                    const shouldRunNow = handleSchedule(deviceSchedules);
                    const isCurrentlyRunning = (deviceStatus === 'running' || deviceStatus === 'running_plan');

                    if (shouldRunNow && !isCurrentlyRunning) {
                        startDataMonitoring();
                        deviceStatus = 'running_plan';
                        mqttService.publishDeviceStatus(client, deviceID, statusTopic, 'running_plan', false);
                        logger.info(`${deviceID} started based on the new schedule.`);
                    } else if (!shouldRunNow && isCurrentlyRunning) {
                        clearInterval(dataMonitoringInterval);
                        deviceStatus = 'stopped_plan';
                        mqttService.publishDeviceStatus(client, deviceID, statusTopic, 'stopped_plan', false);
                        logger.info(`${deviceID} stopped based on the new schedule.`);
                    } else if (shouldRunNow && isCurrentlyRunning) {
                        logger.info(`${deviceID} is already running, no change needed.`);
                    } else if (!shouldRunNow && !isCurrentlyRunning) {
                        logger.info(`${deviceID} is already stopped, no change needed.`);
                    }
                }
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
        clearInterval(dataMonitoringInterval);
        clearInterval(heartbeatInterval);
        clearInterval(scheduleCheckInterval);
    });

    function startDataMonitoring() {
        if (dataMonitoringInterval) {
            clearInterval(dataMonitoringInterval);
        }
        logger.info(`${deviceID} Starting data monitoring.`);
        dataMonitoringInterval = setInterval(() => {
            dataService.publishComponentDataToHTTP(client, deviceID, deviceLocation, components, SIMULATED_HOURS_PER_INTERVAL, alertTopicBase, runningHoursTopic);
        }, DATA_PUBLISH_INTERVAL_MS);
    }
}

module.exports = createStm32Simulator;
