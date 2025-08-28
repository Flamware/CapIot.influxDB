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
const deviceID = 'STM32-Simulator-003';
const availabilityTopic = `devices/available/${deviceID}`;
const statusTopic = `devices/status/${deviceID}`;
const heartbeatTopic = `devices/heartbeat/${deviceID}`;
const configTopic = `devices/config/${deviceID}`;
const commandsTopic = `devices/commands/${deviceID}`;
const alertTopicBase = `devices/alert`;

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
    publishAvailability();
    publishDeviceStatus('online', true);
    client.subscribe(configTopic, { qos: 1 });
    client.subscribe(commandsTopic, { qos: 1 });
    // Le topic de provisionnement n'est plus nécessaire car le device génère ses propres IDs
    // client.subscribe(provisionTopic, { qos: 1 });
    heartbeatInterval = setInterval(publishHeartbeat, 5000); // Démarrer le heartbeat immédiatement
});

client.on('message', (topic, message) => {
    const payloadString = message.toString();
    logger.info(`${deviceID} a reçu un message sur le topic ${topic}: ${payloadString}`);

    try {
        const payload = JSON.parse(payloadString);
        // Le handler de provisionnement n'est plus nécessaire
        // if (topic === provisionTopic) {
        //     handleProvisioning(payload);
        // } else
        if (topic === configTopic) {
            handleDeviceConfig(payload);
        } else if (topic === commandsTopic) {
            handleDeviceCommand(payload);
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

// La fonction handleProvisioning n'est plus nécessaire

function publishDeviceStatus(status, retain) {
    const payload = {
        device_id: deviceID,
        status: status,
        timestamp: moment().toISOString(),
    };
    client.publish(statusTopic, JSON.stringify(payload), { qos: 1, retain: retain }, (error) => {
        if (error) {
            logger.error(`${deviceID} Erreur lors de la publication du statut: ${error}`);
        } else {
            logger.info(`${deviceID} Statut '${status}' publié sur ${statusTopic}`);
        }
    });
}

function publishAvailability() {
    const capabilities = components.map(component => ({
        component_id: component.component_id, // Maintenant, l'ID unique est généré ici
        component_name: component.component_name,
        component_type: component.component_type,
        component_subtype: component.component_subtype,
        max_running_hours: component.max_running_hours, // Inclure max_running_hours
    }));

    const payload = {
        device_id: deviceID,
        timestamp: moment().toISOString(),
        components: capabilities,
        status: deviceStatus, // Inclure le statut actuel du device
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

function handleDeviceConfig(payload) {
    // La configuration peut maintenant se baser directement sur component_id
    const { component_id, min_threshold, max_threshold } = payload;
    const targetComponent = components.find(c => c.component_id === component_id);

    if (targetComponent && targetComponent.component_type === 'sensor') {
        targetComponent.min_threshold = parseFloat(min_threshold);
        targetComponent.max_threshold = parseFloat(max_threshold);
        logger.info(`${deviceID} Config. mise à jour pour le composant '${targetComponent.component_id}': min=${targetComponent.min_threshold}, max=${targetComponent.max_threshold}`);
    } else {
        logger.warn(`${deviceID} Composant '${component_id}' non trouvé ou n'est pas un capteur pour la configuration.`);
    }
}

function handleDeviceCommand(payload) {
    const { command, component_id, location_id } = payload; // Utiliser component_id pour les commandes

    switch (command) {
        case 'start_monitoring':
            if (location_id) {
                monitoringLocationId = location_id;
                deviceLocation = monitoringLocationId.toString();
                startDataMonitoring();
                deviceStatus = 'running';
                publishDeviceStatus('running', false);
            } else {
                logger.error(`${deviceID} Commande 'start_monitoring' sans 'location_id'.`);
            }
            break;
        case 'stop_monitoring':
            if (dataMonitoringInterval) {
                clearInterval(dataMonitoringInterval);
                monitoringLocationId = null;
                deviceStatus = 'available';
                publishDeviceStatus('available', false);
                logger.info(`${deviceID} Surveillance des données arrêtée.`);
            }
            break;
        case 'reset_component_timer':
            handleResetComponentTimer(component_id); // Utiliser component_id
            break;
        default:
            logger.warn(`${deviceID} Commande inconnue reçue: ${command}.`);
            break;
    }
}

function handleResetComponentTimer(component_id) { // Utiliser component_id
    const targetComponent = components.find(c => c.component_id === component_id);

    if (targetComponent) {
        targetComponent.running_hours = 0;
        targetComponent.status = 'ok';
        logger.info(`${deviceID} Compteur réinitialisé pour le composant '${targetComponent.component_id}'.`);
        client.publish(`${statusTopic}/component_reset`, JSON.stringify({
            device_id: deviceID,
            component_id: targetComponent.component_id,
            status: 'reset_success',
            timestamp: moment().toISOString()
        }), { qos: 1 });
    } else {
        logger.warn(`${deviceID} Impossible de réinitialiser: Composant '${component_id}' non trouvé.`);
        client.publish(`${statusTopic}/component_reset`, JSON.stringify({
            device_id: deviceID,
            component_id: component_id, // Envoyer l'ID non trouvé pour le débogage
            status: 'reset_failed',
            error: 'Component not found',
            timestamp: moment().toISOString()
        }), { qos: 1 });
    }
}

function startDataMonitoring() {
    logger.info(`${deviceID} Démarrage de la surveillance des données.`);
    dataMonitoringInterval = setInterval(publishComponentDataToHTTP, DATA_PUBLISH_INTERVAL_MS);
}

function publishComponentDataToHTTP() {
    const timestamp = moment().toISOString();
    const componentDataArray = [];

    components.forEach(component => {
        // component.component_id est toujours défini ici grâce à l'initialisation
        const componentIDForLog = component.component_id;

        component.running_hours += SIMULATED_HOURS_PER_INTERVAL;

        if (component.max_running_hours && component.running_hours >= component.max_running_hours) {
            if (component.status !== 'obsolete') {
                component.status = 'obsolete';
                const alertMessage = `Component '${component.component_name}' has exceeded its max running hours.`;
                const alertTopic = `${alertTopicBase}/${deviceID}`;
                const alertPayload = {
                    device_id: deviceID,
                    component_id: componentIDForLog,
                    alert: alertMessage,
                    timestamp: timestamp,
                    alert_type: 'obsolescence',
                };
                client.publish(alertTopic, JSON.stringify(alertPayload), { qos: 1 }, (error) => {
                    if (error) {
                        logger.error(`${deviceID} Erreur lors de la publication de l'alerte: ${error}`);
                    } else {
                        logger.warn(`${deviceID} Alerte d'obsolescence publiée pour ${componentIDForLog}`);
                    }
                });
            }
        }
        if (component.component_type === 'sensor') {
            const randomChange = (Math.random() - 0.5) * component.variance;
            component.currentValue += randomChange;
            component.currentValue = Math.max(component.min, Math.min(component.max, component.currentValue));
            const value = parseFloat(component.currentValue.toFixed(2));
            if (component.status !== 'obsolete' && (value < component.min_threshold || value > component.max_threshold)) {
                component.status = 'warning';
                const alertMessage = `Value (${value}) is outside thresholds for ${component.component_subtype}.`;
                const alertTopic = `${alertTopicBase}/${deviceID}`;
                const alertPayload = {
                    device_id: deviceID,
                    component_id: componentIDForLog,
                    alert: alertMessage,
                    timestamp: timestamp,
                    alert_type: 'threshold_exceeded',
                };
                client.publish(alertTopic, JSON.stringify(alertPayload), { qos: 1 }, (error) => {
                    if (error) {
                        logger.error(`${deviceID} Erreur lors de la publication de l'alerte: ${error}`);
                    } else {
                        logger.warn(`${deviceID} Alerte publiée pour ${componentIDForLog}`);
                    }
                });
            } else if (component.status !== 'obsolete') {
                component.status = 'ok';
            }

            const componentData = {
                time: timestamp,
                location_id: deviceLocation,
                device_id: deviceID,
                component_id: componentIDForLog,
                field: component.component_subtype,
                value: value,
                min_threshold: component.min_threshold,
                max_threshold: component.max_threshold,
                running_hours: parseFloat(component.running_hours.toFixed(0)),
                timestamp: timestamp,
            };
            componentDataArray.push(componentData);
        } else {
            if (component.status !== 'obsolete') {
                const componentData = {
                    time: timestamp,
                    location_id: deviceLocation,
                    device_id: deviceID,
                    component_id: componentIDForLog,
                    field: component.component_subtype,
                    value: component.status === 'ok' ? 1 : 0,
                    running_hours: parseFloat(component.running_hours.toFixed(0)),
                    timestamp: timestamp,
                };
                componentDataArray.push(componentData);
            } else {
                logger.info(`Component '${componentIDForLog}' is obsolete. No data to publish.`);
            }
        }
    });
    sendDataToInfluxDB(componentDataArray);
}

function sendDataToInfluxDB(componentDataArray) {
    if (componentDataArray.length === 0) {
        return;
    }
    const postData = JSON.stringify(componentDataArray);
    const options = {
        hostname: 'influxdb.flamware.work',
        port: 80,
        path: '/influxdb/componentdata',
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