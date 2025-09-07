const moment = require('moment');
const http = require('http');
const winston = require('winston');

// Logger configuration (répété pour que le module puisse logger indépendamment)
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console({ format: winston.format.simple() }),
    ],
});

/**
 * Envoie les données générées par les composants à un serveur HTTP externe (simulé).
 * @param {Array} componentDataArray Les données des composants à envoyer.
 */
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
                logger.info(`Données envoyées à InfluxDB. Code: ${res.statusCode}`);
            } else {
                logger.error(`Échec de l'envoi à InfluxDB. Code: ${res.statusCode}, Réponse: ${responseData}`);
            }
        });
    });
    req.on('error', (error) => {
        logger.error(`Erreur HTTP lors de l'envoi: ${error}`);
    });
    req.write(postData);
    req.end();
}

/**
 * Simule la génération et la publication des données des composants.
 * Les données de capteurs sont envoyées à un service HTTP et les heures de fonctionnement
 * sont publiées sur un topic MQTT.
 * @param {object} client Le client MQTT (pour les alertes et les heures de fonctionnement).
 * @param {string} deviceID L'ID du device.
 * @param {string} deviceLocation L'emplacement du device.
 * @param {Array} components Les composants du device.
 * @param {number} hoursPerInterval Le nombre d'heures simulées par intervalle.
 * @param {string} alertTopicBase Le topic de base pour les alertes.
 * @param {string} runningHoursTopic Le topic pour la publication des heures de fonctionnement.
 */
function publishComponentDataToHTTP(client, deviceID, deviceLocation, components, hoursPerInterval, alertTopicBase, runningHoursTopic) {
    const timestamp = moment().toISOString();
    const componentDataArray = [];

    components.forEach(component => {
        // Incrémenter les heures de fonctionnement
        component.running_hours += hoursPerInterval;

        // Préparer le payload pour la publication MQTT des heures de fonctionnement
        const runningHoursPayload = {
            device_id: deviceID,
            component_id: component.component_id,
            running_hours: parseFloat(component.running_hours.toFixed(0)),
            timestamp: timestamp,
        };

        // Publier les heures de fonctionnement via MQTT
        client.publish(runningHoursTopic, JSON.stringify(runningHoursPayload), { qos: 1 }, (error) => {
            if (error) {
                logger.error(`${deviceID} Erreur lors de la publication des heures de fonctionnement pour ${component.component_id}: ${error}`);
            } else {
                logger.info(`${deviceID} Heures de fonctionnement publiées pour ${component.component_id}: ${component.running_hours}`);
            }
        });

        if (component.max_running_hours && component.running_hours >= component.max_running_hours) {
            if (component.status !== 'obsolete') {
                component.status = 'obsolete';
                const alertMessage = `Component '${component.component_name}' has exceeded its max running hours.`;
                const alertTopic = `${alertTopicBase}/${deviceID}`;
                const alertPayload = {
                    device_id: deviceID,
                    component_id: component.component_id,
                    alert: alertMessage,
                    timestamp: timestamp,
                    alert_type: 'obsolescence',
                };
                client.publish(alertTopic, JSON.stringify(alertPayload), { qos: 1 }, (error) => {
                    if (error) {
                        logger.error(`${deviceID} Erreur lors de la publication de l'alerte: ${error}`);
                    } else {
                        logger.warn(`${deviceID} Alerte d'obsolescence publiée pour ${component.component_id}`);
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
                    component_id: component.component_id,
                    alert: alertMessage,
                    timestamp: timestamp,
                    alert_type: 'threshold_exceeded',
                };
                client.publish(alertTopic, JSON.stringify(alertPayload), { qos: 1 }, (error) => {
                    if (error) {
                        logger.error(`${deviceID} Erreur lors de la publication de l'alerte: ${error}`);
                    } else {
                        logger.warn(`${deviceID} Alerte publiée pour ${component.component_id}`);
                    }
                });
            } else if (component.status !== 'obsolete') {
                component.status = 'ok';
            }

            const componentData = {
                time: timestamp,
                location_id: deviceLocation,
                device_id: deviceID,
                component_id: component.component_id,
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
                    component_id: component.component_id,
                    field: component.component_subtype,
                    value: component.status === 'ok' ? 1 : 0,
                    running_hours: parseFloat(component.running_hours.toFixed(0)),
                    timestamp: timestamp,
                };
                componentDataArray.push(componentData);
            } else {
                logger.info(`Component '${component.component_id}' is obsolete. No data to publish.`);
            }
        }
    });
    sendDataToInfluxDB(componentDataArray);
}

module.exports = {
    publishComponentDataToHTTP
};
