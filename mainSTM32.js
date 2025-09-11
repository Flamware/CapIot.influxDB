const mqtt = require('mqtt');
const winston = require('winston');
const moment = require('moment');

// Importation des services modulaires
const mqttService = require('./mqttService');
const dataService = require('./dataService');

// Logger configuration
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console({ format: winston.format.simple() }),
    ],
});

// MQTT config
const mqttBroker = 'mqtt://localhost:1883';
const deviceID = 'STM32-Simulator-001';
const availabilityTopic = `devices/available/${deviceID}`;
const statusTopic = `devices/status/${deviceID}`;
const heartbeatTopic = `devices/heartbeat/${deviceID}`;
const configTopic = `devices/config/${deviceID}`;
const commandsTopic = `devices/commands/${deviceID}`;
const alertTopicBase = `devices/alert`;
const runningHoursTopic = `devices/running_hours/${deviceID}`;

// Simulation rate: 1 second in real-time equals 1 hour of running time
const SIMULATION_SECONDS_PER_HOUR = 1;
const DATA_PUBLISH_INTERVAL_MS = 5000;
const SIMULATED_HOURS_PER_INTERVAL = DATA_PUBLISH_INTERVAL_MS / 1000 * SIMULATION_SECONDS_PER_HOUR;

// Components avec le nouveau nommage et génération de component_id
const components = [
    {
        component_name: 'temp-sim-001',
        component_type: 'sensor',
        component_subtype: 'temperature',
        status: 'ok',
        currentValue: 20 + Math.random() * 15,
        variance: 0.5,
        min: -5,
        max: 40,
        min_threshold: 10,
        max_threshold: 35,
        running_hours: 0,
        max_running_hours: 87600,
    },
    {
        component_name: 'hum-sim-001',
        component_type: 'sensor',
        component_subtype: 'humidity',
        status: 'ok',
        currentValue: 40 + Math.random() * 40,
        variance: 2,
        min: 0,
        max: 100,
        min_threshold: 30,
        max_threshold: 70,
        running_hours: 0,
        max_running_hours: 87600,
    },
    {
        component_name: 'fan-sim-001',
        component_type: 'actuator',
        component_subtype: 'fan',
        status: 'fault',
        speed: 0,
        running_hours: 0,
        max_running_hours: 30000,
    },
    {
        component_name: 'led-sim-001',
        component_type: 'indicator',
        component_subtype: 'LED',
        status: 'warning',
        running_hours: 0,
        max_running_hours: 50000,
    },
];

// Générer les component_id uniques au démarrage en combinant deviceID et component_name
components.forEach(comp => {
    comp.component_id = `${deviceID}-${comp.component_name}`;
});

let deviceLocation = '';
let monitoringLocationId = null;
let deviceStatus = 'online';

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

client.on('connect', () => {
    logger.info(`${deviceID} connecté au broker MQTT`);
    mqttService.publishAvailability(client, deviceID, availabilityTopic, components, deviceStatus);
    mqttService.publishDeviceStatus(client, deviceID, statusTopic, 'online', true);
    client.subscribe(configTopic, { qos: 1 });
    client.subscribe(commandsTopic, { qos: 1 });
    heartbeatInterval = setInterval(() => {
        mqttService.publishHeartbeat(client, deviceID, heartbeatTopic, deviceStatus);
    }, 5000);
});

client.on('message', (topic, message) => {
    const payloadString = message.toString();

    try {
        const payload = JSON.parse(payloadString);
        logger.info(`${deviceID} Message reçu sur ${topic}: ${payloadString}`);
        if (topic === configTopic) {
            mqttService.handleDeviceConfig(components, payload);
        } else if (topic === commandsTopic) {
            const { command, component_id, location_id } = payload;
            console.log(command, component_id, location_id);
            switch (command) {
                case 'Start':
                    if (location_id) {
                        monitoringLocationId = location_id;
                        deviceLocation = monitoringLocationId.toString();
                        startDataMonitoring();
                        deviceStatus = 'running';
                        mqttService.publishDeviceStatus(client, deviceID, statusTopic, 'Running', false);
                    } else {
                        logger.error(`${deviceID} Commande 'start_monitoring' sans 'location_id'.`);
                    }
                    break;
                case 'Stop':
                    if (dataMonitoringInterval) {
                        clearInterval(dataMonitoringInterval);
                    }
                    monitoringLocationId = null;
                    mqttService.publishDeviceStatus(client, deviceID, statusTopic, 'Online', false);
                    logger.info(`${deviceID} Surveillance des données arrêtée.`);
                    break;
                case 'Reset':
                    mqttService.handleResetComponentTimer(client, deviceID, statusTopic, components, component_id);
                    break;
                default:
                    logger.warn(`${deviceID} Commande inconnue reçue: ${command}.`);
                    break;
            }
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

function startDataMonitoring() {
    logger.info(`${deviceID} Démarrage de la surveillance des données.`);
    dataMonitoringInterval = setInterval(() => {
        dataService.publishComponentDataToHTTP(client, deviceID, deviceLocation, components, SIMULATED_HOURS_PER_INTERVAL, alertTopicBase, runningHoursTopic);
    }, DATA_PUBLISH_INTERVAL_MS);
}
