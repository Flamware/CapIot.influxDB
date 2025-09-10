const mqtt = require('mqtt');
const winston = require('winston');
const moment = require('moment');
const http = require('http');

// Logger configuration
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console({ format: winston.format.simple() }),
    ],
});

// MQTT config
const mqttBroker = 'tcp://mqtt.flamware.work:1883';
// CHANGED: Device ID for the second simulator
const deviceID = 'STM32-Simulator-002';
const availabilityTopic = `devices/available/${deviceID}`;
const statusTopic = `devices/status/${deviceID}`;
const heartbeatTopic = `devices/heartbeat/${deviceID}`;
const configTopic = `devices/config/${deviceID}`;
const dataTopicBase = `iot/data/${deviceID}`;
const alertTopicBase = `devices/alert`; // NEW: Base for alert topics

// Updated sensors with min and max thresholds
const sensors = [
    {
        type: 'temperature',
        id: 'temp-sim-002', // Changed sensor ID to reflect new device
        currentValue: 20 + Math.random() * 15,
        variance: 0.5,
        min: -5,
        max: 40,
        min_threshold: 10,
        max_threshold: 35,
    },
    {
        type: 'humidity',
        id: 'hum-sim-002', // Changed sensor ID to reflect new device
        currentValue: 40 + Math.random() * 40,
        variance: 2,
        min: 0,
        max: 100,
        min_threshold: 30,
        max_threshold: 70,
    },
    {
        type: 'pressure',
        id: 'press-sim-002', // Changed sensor ID to reflect new device
        currentValue: 980 + Math.random() * 50,
        variance: 5,
        min: 950,
        max: 1050,
        min_threshold: 970,
        max_threshold: 1030,
    },
];

let deviceLocation = '';
let monitoringLocationId = null;
let deviceStatus = 'available';

// MQTT connection options
const connectOptions = {
    clientId: deviceID,
    username: 'admin',
    password: 'admin',
    will: {
        // --- CHANGE HERE: LWT topic is the availability topic ---
        topic: availabilityTopic, // Use the same topic as initial availability
        payload: JSON.stringify({
            device_id: deviceID,
            status: 'offline', // Indicate offline status
            timestamp: moment().toISOString()
        }),
        qos: 1,
        retain: true, // Make the LWT message retained as well
    },
};

const client = mqtt.connect(mqttBroker, connectOptions);

client.on('connect', () => {
    logger.info(`${deviceID} connecté au broker MQTT`);
    publishAvailability();
    client.subscribe(statusTopic, { qos: 1 });
    client.subscribe(heartbeatTopic, { qos: 0 });
    client.subscribe(configTopic, { qos: 1 });
    heartbeatInterval = setInterval(publishHeartbeat, 5000);
});

client.on('message', (topic, message) => {
    const payloadString = message.toString();
    logger.info(`${deviceID} a reçu un message sur le topic ${topic}: ${payloadString}`);

    try {
        const payload = JSON.parse(payloadString);
        if (topic === statusTopic) {
            handleDeviceStatus(payload);
        } else if (topic === heartbeatTopic) {
            handleHeartbeat(payload);
        } else if (topic === configTopic) {
            handleDeviceConfig(payload);
        }
    } catch (error) {
        logger.error(`${deviceID} Erreur lors du parsing du message sur ${topic}: ${error}`);
    }
});

client.on('error', (error) => {
    logger.error(`${deviceID} Erreur MQTT: ${error}`);
});

client.on('disconnect', () => {
    logger.info(`${deviceID} déconnecté du broker MQTT`);
    deviceStatus = 'offline';
    monitoringLocationId = null;
    clearInterval(dataMonitoringInterval);
    clearInterval(heartbeatInterval);
});

function publishAvailability() {
    const capabilities = sensors.map(sensor => ({
        sensor_type: sensor.type,
        sensor_id: sensor.id,
        min_threshold: sensor.min_threshold,
        max_threshold: sensor.max_threshold,
    }));

    const payload = {
        device_id: deviceID,
        status: deviceStatus,
        timestamp: moment().toISOString(),
        sensors: capabilities,
    };

    // --- CHANGE HERE: Set retain to true ---
    client.publish(availabilityTopic, JSON.stringify(payload), { qos: 1, retain: true }, (error) => {
        if (error) {
            logger.error(`${deviceID} Erreur lors de la publication de l'availability: ${error}`);
        } else {
            logger.info(`${deviceID} Availability publiée sur ${availabilityTopic}: ${JSON.stringify(payload)} (retained)`);
        }
    });
}

function publishHeartbeat() {
    const payload = {
        device_id: deviceID,
        timestamp: moment().toISOString(),
        status: deviceStatus,
    };

    client.publish(heartbeatTopic, JSON.stringify(payload), { qos: 0, retain: false }, (error) => {
        if (error) {
            logger.error(`${deviceID} Erreur lors de la publication du heartbeat: ${error}`);
        } else {
        }
    });
}

function handleHeartbeat(payload) {
    // Extend here if needed
}

let dataMonitoringInterval;

function handleDeviceStatus(payload) {
    logger.info(`${deviceID} a reçu un statut : ${JSON.stringify(payload)}`);
    const newStatus = payload.status;

    if (newStatus !== deviceStatus) {
        deviceStatus = newStatus;
        clearInterval(dataMonitoringInterval);

        const statusPayload = {
            device_id: deviceID,
            status: newStatus,
            timestamp: moment().toISOString(),
        };

        client.publish(statusTopic, JSON.stringify(statusPayload), { qos: 1 }, (error) => {
            if (error) {
                logger.error(`${deviceID} Error publishing status: ${error}`);
            } else {
                logger.info(`${deviceID} Status published on ${statusTopic}: ${JSON.stringify(statusPayload)}`);
            }
        });

        if (newStatus === 'Running') {
            if (payload.location_id) {
                monitoringLocationId = payload.location_id;
                deviceLocation = monitoringLocationId.toString();
                startDataMonitoring();
            } else {
                logger.error(`${deviceID} Erreur: La localisation du device est manquante dans le message de statut.`);
            }
        } else {
            logger.info(`${deviceID} Status is ${newStatus}. Stopping data monitoring.`);
            monitoringLocationId = null;
        }
    } else {
        logger.info(`${deviceID} Status déjà à jour: ${newStatus}`);
        if (newStatus === 'Running' && !dataMonitoringInterval) {
            if (payload.location_id) {
                monitoringLocationId = payload.location_id;
                deviceLocation = monitoringLocationId.toString();
                startDataMonitoring();
            } else {
                logger.error(`${deviceID} Erreur: La localisation du device est manquante in repeated 'Running' status.`);
            }
        } else if (newStatus !== 'Running' && dataMonitoringInterval) {
            clearInterval(dataMonitoringInterval);
            monitoringLocationId = null;
        }
    }
}

function handleDeviceConfig(payload) {
    const { sensor_id, min_threshold, max_threshold } = payload;

    if (!sensor_id || min_threshold === undefined || max_threshold === undefined) {
        logger.warn(`${deviceID} Configuration invalide reçue: 'sensor_id', 'min_threshold', ou 'max_threshold' manquant. Payload: ${JSON.stringify(payload)}`);
        return;
    }

    const targetSensor = sensors.find(s => s.id === sensor_id);

    if (targetSensor) {
        targetSensor.min_threshold = parseFloat(min_threshold);
        targetSensor.max_threshold = parseFloat(max_threshold);
        logger.info(`${deviceID} Configuration mise à jour pour le capteur '${sensor_id}': min_threshold=${targetSensor.min_threshold}, max_threshold=${targetSensor.max_threshold}`);
    } else {
        logger.warn(`${deviceID} Capteur '${sensor_id}' non trouvé pour la configuration.`);
    }
}

function startDataMonitoring() {
    logger.info(`${deviceID} Démarrage de la surveillance et de la publication des données. Localisation: ${deviceLocation}`);
    dataMonitoringInterval = setInterval(publishSensorDataToHTTP, 5000);
}

function publishSensorDataToHTTP() {
    const timestamp = moment().toISOString();
    const sensorDataArray = [];

    sensors.forEach(sensor => {
        const randomChange = (Math.random() - 0.5) * sensor.variance;
        sensor.currentValue += randomChange;
        sensor.currentValue = Math.max(sensor.min, Math.min(sensor.max, sensor.currentValue));

        const value = parseFloat(sensor.currentValue.toFixed(2));

        // --- NEW: Check for alert conditions ---
        let alertMessage = '';
        if (value < sensor.min_threshold) {
            alertMessage = `Value (${value}) below min threshold (${sensor.min_threshold}) for ${sensor.type}.`;
        } else if (value > sensor.max_threshold) {
            alertMessage = `Value (${value}) above max threshold (${sensor.max_threshold}) for ${sensor.type}.`;
        }

        if (alertMessage) {
            const alertTopic = `${alertTopicBase}/${deviceID}`;
            const alertPayload = {
                device_id: deviceID,
                sensor_id: sensor.id,
                alert: alertMessage,
                timestamp: timestamp,
            };
            client.publish(alertTopic, JSON.stringify(alertPayload), { qos: 1 }, (error) => {
                if (error) {
                    logger.error(`${deviceID} Erreur lors de la publication de l'alerte sur ${alertTopic}: ${error}`);
                } else {
                    logger.warn(`${deviceID} Alerte publiée sur ${alertTopic}: ${JSON.stringify(alertPayload)}`);
                }
            });
        }
        // --- END NEW: Check for alert conditions ---

        const sensorData = {
            time: timestamp,
            location_id: deviceLocation,
            device_id: deviceID,
            sensor_id: parseInt(sensor.id.split('-').pop(), 10), // Assuming ID ends with an integer for sensor_id
            field: sensor.type,
            value: value,
            min_threshold: sensor.min_threshold,
            max_threshold: sensor.max_threshold,
            timestamp: timestamp,
        };

        sensorDataArray.push(sensorData);
    });

    sendDataToInfluxDB(sensorDataArray);
}

function sendDataToInfluxDB(sensorDataArray) {
    const postData = JSON.stringify(sensorDataArray);
    const options = {
        hostname: 'influxdb.flamware.work',
        port: 80,
        path: '/influxdb/sensordata',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': postData.length,
        },
    };

    const req = http.request(options, (res) => {
        let responseData = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { responseData += chunk; });
        res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                logger.info(`${deviceID} Données envoyées à InfluxDB. Code: ${res.statusCode}`);
            } else {
                logger.error(`${deviceID} Échec de l'envoi à InfluxDB. Code: ${res.statusCode}, Réponse: ${responseData}`);
            }
        });
    });

    req.on('error', (error) => {
        logger.error(`${deviceID} Erreur HTTP lors de l'envoi: ${error}`);
    });

    req.write(postData);
    req.end();
}

let heartbeatInterval = setInterval(publishHeartbeat, 5000);