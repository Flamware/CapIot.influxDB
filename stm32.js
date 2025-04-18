const mqtt = require('mqtt');
const winston = require('winston');
const moment = require('moment');
const http = require('http');

// Configuration du logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console({ format: winston.format.simple() }),
    ],
});

// Configuration MQTT
const mqttBroker = 'tcp://34.163.43.18:30001';
const deviceID = 'STM32-Simulator-001';
const availabilityTopic = `devices/available/${deviceID}`;
const statusTopic = `devices/status/${deviceID}`;
const heartbeatTopic = `devices/heartbeat/${deviceID}`;
const startMonitoringTopic = `devices/${deviceID}/monitoring/start`; // New topic
const dataTopicBase = `iot/data/${deviceID}`;

// Configuration des capteurs simulés avec des plages réalistes et des tendances
const sensors = [
    { type: 'temperature', id: 'temp-sim-001', currentValue: 20 + Math.random() * 15, variance: 0.5, min: -5, max: 40 }, // Température en °C
    { type: 'humidity', id: 'hum-sim-001', currentValue: 40 + Math.random() * 40, variance: 2, min: 0, max: 100 },   // Humidité en %
    { type: 'pressure', id: 'press-sim-001', currentValue: 980 + Math.random() * 50, variance: 5, min: 950, max: 1050 }, // Pression en hPa
];

let deviceLocation = ''; // Store the location received from monitoring/start
let monitoringLocationId;

// Options de connexion MQTT avec LWT
const connectOptions = {
    clientId: deviceID,
    username: 'admin',
    password: 'admin',
    will: {
        topic: `devices/lwt/${deviceID}`,
        payload: JSON.stringify({ device_id: deviceID, status: 'offline', timestamp: moment().toISOString() }),
        qos: 1,
        retain: false,
    },
};

// Création du client MQTT
const client = mqtt.connect(mqttBroker, connectOptions);

client.on('connect', () => {
    logger.info(`${deviceID} connecté au broker MQTT`);

    // Publication immédiate de l'availability
    publishAvailability();
    publishOnlineStatus(); //send the online status
    // Abonnement aux topics
    client.subscribe(statusTopic, { qos: 1 }); //  status
    client.subscribe(heartbeatTopic, { qos: 0 });
    client.subscribe(startMonitoringTopic, { qos: 1 }); // Subscribe to start monitoring

});

client.on('message', (topic, message) => {
    const payloadString = message.toString();
    logger.info(`${deviceID} a reçu un message sur le topic ${topic}: ${payloadString}`);

    try {
        const payload = JSON.parse(payloadString);

        if (topic === statusTopic) {
            handleStatus(payload);
        } else if (topic === heartbeatTopic) {
            handleHeartbeat(payload);
        } else if (topic === startMonitoringTopic) {
            handleStartMonitoring(payload); // Handle start monitoring message
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
});

function publishAvailability() {
    const capabilities = sensors.map(sensor => ({
        captor_type: sensor.type,
        captor_id: sensor.id,
    }));

    const payload = {
        device_id: deviceID,
        status: 'online',
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

function publishOnlineStatus() {
    const payload = {
        device_id: deviceID,
        status: 'running',
        timestamp: moment().toISOString(),
    };

    client.publish(statusTopic, JSON.stringify(payload), { qos: 1, retain: false }, (error) => {
        if (error) {
            logger.error(`${deviceID} Erreur lors de la publication du statut en ligne: ${error}`);
        } else {
            logger.info(`${deviceID} Statut "running" publié sur ${statusTopic}: ${JSON.stringify(payload)}`);
        }
    });
}

function publishHeartbeat() {
    const payload = {
        device_id: deviceID,
        timestamp: moment().toISOString(),
    };

    client.publish(heartbeatTopic, JSON.stringify(payload), { qos: 0, retain: false }, (error) => {
        if (error) {
            logger.error(`${deviceID} Erreur lors de la publication du heartbeat: ${error}`);
        } else {
            logger.info(`${deviceID} Heartbeat publié sur ${heartbeatTopic}: ${JSON.stringify(payload)}`);
        }
    });
}

function handleStatus(payload) {
    logger.info(`${deviceID} a reçu un statut : ${JSON.stringify(payload)}`);
}

function handleHeartbeat(payload) {
    logger.info(`${deviceID} a reçu un heartbeat : ${JSON.stringify(payload)}`);
}

function handleStartMonitoring(payload) {
    logger.info(`${deviceID} a reçu la commande de démarrage de la surveillance: ${JSON.stringify(payload)}`);
    if (payload.location_id) {
        monitoringLocationId = payload.location_id;
        deviceLocation = monitoringLocationId.toString(); // Ensure location is a string
        startDataMonitoring(); // Start monitoring and sending data
    } else {
        logger.error(`${deviceID} Erreur: La localisation du device est manquante dans le message de démarrage.`);
    }
}

function startDataMonitoring() {
    logger.info(`${deviceID} Démarrage de la surveillance et de la publication des données vers l'API HTTP. Localisation: ${deviceLocation}`);
    setInterval(publishSensorDataToHTTP, 5000);
}

function publishSensorDataToHTTP() {
    const timestamp = moment().toISOString();
    const sensorDataArray = [];

    sensors.forEach(sensor => {
        // Simuler la lecture du capteur avec une petite variation aléatoire
        const randomChange = (Math.random() - 0.5) * sensor.variance;
        sensor.currentValue += randomChange;

        // S'assurer que les valeurs restent dans des plages réalistes
        sensor.currentValue = Math.max(sensor.min, Math.min(sensor.max, sensor.currentValue));

        const sensorData = {
            time: timestamp,
            location_id: deviceLocation,
            device_id: deviceID,
            sensor_id: parseInt(sensor.id.split('-').pop(), 10), // Extract the numeric part of the ID
            field: sensor.type,
            value: parseFloat(sensor.currentValue.toFixed(2)),
            timestamp: timestamp,
        };
        sensorDataArray.push(sensorData);
    });
    sendDataToInfluxDB(sensorDataArray);
}

function sendDataToInfluxDB(sensorDataArray) {
    const postData = JSON.stringify(sensorDataArray);
    const options = {
        hostname: 'http://34.163.157.209',
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
        res.on('data', (chunk) => {
            responseData += chunk;
        });
        res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                logger.info(`${deviceID} Data successfully sent to InfluxDB API. Status Code: ${res.statusCode}`);
            } else {
                logger.error(`${deviceID} Failed to send data to InfluxDB API. Status Code: ${res.statusCode}, Response: ${responseData}`);
            }
        });
    });

    req.on('error', (error) => {
        logger.error(`${deviceID} HTTP error sending data: ${error}`);
    });

    req.write(postData);
    req.end();
}

// Envoi d'un heartbeat régulier
setInterval(publishHeartbeat, 15000);