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
const deviceID = 'STM32-Simulator-001';
const availabilityTopic = `devices/available/${deviceID}`;
const statusTopic = `devices/status/${deviceID}`;
const heartbeatTopic = `devices/heartbeat/${deviceID}`;
const dataTopicBase = `iot/data/${deviceID}`;

// Updated sensors with min and max thresholds
const sensors = [
    {
        type: 'temperature',
        id: 'temp-sim-001',
        currentValue: 20 + Math.random() * 15,
        variance: 0.5,
        min: -5,
        max: 40,
        min_threshold: 10,
        max_threshold: 35,
    },
    {
        type: 'humidity',
        id: 'hum-sim-001',
        currentValue: 40 + Math.random() * 40,
        variance: 2,
        min: 0,
        max: 100,
        min_threshold: 30,
        max_threshold: 70,
    },
    {
        type: 'pressure',
        id: 'press-sim-001',
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
        topic: `devices/lwt/${deviceID}`,
        payload: JSON.stringify({
            device_id: deviceID,
            status: 'offline',
            timestamp: moment().toISOString()
        }),
        qos: 1,
        retain: false,
    },
};

const client = mqtt.connect(mqttBroker, connectOptions);

client.on('connect', () => {
    logger.info(`${deviceID} connecté au broker MQTT`);
    publishAvailability();
    client.subscribe(statusTopic, { qos: 1 });
    client.subscribe(heartbeatTopic, { qos: 0 });
    heartbeatInterval = setInterval(publishHeartbeat, 5000);
});

client.on('message', (topic, message) => {
    const payloadString = message.toString();
    logger.info(`${deviceID} a reçu un message sur le topic ${topic}: ${payloadString}`);

    try {
        const payload = JSON.parse(payloadString);
        if (topic === statusTopic) handleDeviceStatus(payload);
        else if (topic === heartbeatTopic) handleHeartbeat(payload);
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
        captor_type: sensor.type,
        captor_id: sensor.id,
        min_threshold: sensor.min_threshold,
        max_threshold: sensor.max_threshold,
    }));

    const payload = {
        device_id: deviceID,
        status: deviceStatus,
        timestamp: moment().toISOString(),
        captors: capabilities,
    };

    client.publish(availabilityTopic, JSON.stringify(payload), { qos: 1, retain: false }, (error) => {
        if (error) {
            logger.error(`${deviceID} Erreur lors de la publication de l'availability: ${error}`);
        } else {
            logger.info(`${deviceID} Availability publiée sur ${availabilityTopic}: ${JSON.stringify(payload)}`);
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
            logger.info(`${deviceID} Heartbeat publié sur ${heartbeatTopic}: ${JSON.stringify(payload)}`);
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

        const sensorData = {
            time: timestamp,
            location_id: deviceLocation,
            device_id: deviceID,
            sensor_id: parseInt(sensor.id.split('-').pop(), 10),
            field: sensor.type,
            value: parseFloat(sensor.currentValue.toFixed(2)),
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

// Start heartbeat
let heartbeatInterval = setInterval(publishHeartbeat, 5000);
