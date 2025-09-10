const moment = require('moment');
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
 * Publie le statut du device sur un topic MQTT.
 * @param {object} client Le client MQTT.
 * @param {string} deviceID L'ID du device.
 * @param {string} topic Le topic de statut.
 * @param {string} status Le statut à publier.
 * @param {boolean} retain Indique si le message doit être conservé.
 */
function publishDeviceStatus(client, deviceID, topic, status, retain) {
    const payload = {
        device_id: deviceID,
        status: status,
        timestamp: moment().toISOString(),
    };
    client.publish(topic, JSON.stringify(payload), { qos: 1, retain: retain }, (error) => {
        if (error) {
            logger.error(`${deviceID} Erreur lors de la publication du statut: ${error}`);
        } else {
            logger.info(`${deviceID} Statut '${status}' publié sur ${topic}`);
        }
    });
}

/**
 * Publie la disponibilité du device et la liste de ses composants.
 * @param {object} client Le client MQTT.
 * @param {string} deviceID L'ID du device.
 * @param {string} topic Le topic d'availability.
 * @param {Array} components Les composants du device.
 * @param {string} deviceStatus Le statut actuel du device.
 */
function publishAvailability(client, deviceID, topic, components, deviceStatus) {
    const capabilities = components.map(component => ({
        component_id: component.component_id,
        component_name: component.component_name,
        component_type: component.component_type,
        component_subtype: component.component_subtype,
        max_running_hours: component.max_running_hours,
    }));

    const payload = {
        device_id: deviceID,
        timestamp: moment().toISOString(),
        components: capabilities,
        status: deviceStatus,
    };

    client.publish(topic, JSON.stringify(payload), { qos: 1, retain: false }, (error) => {
        if (error) {
            logger.error(`${deviceID} Erreur lors de la publication de l'availability: ${error}`);
        } else {
            logger.info(`${deviceID} Availability publiée sur ${topic}: ${JSON.stringify(payload)}`);
        }
    });
}

/**
 * Publie un message de heartbeat pour indiquer que le device est actif.
 * @param {object} client Le client MQTT.
 * @param {string} deviceID L'ID du device.
 * @param {string} topic Le topic de heartbeat.
 * @param {string} deviceStatus Le statut actuel du device.
 */
function publishHeartbeat(client, deviceID, topic, deviceStatus) {
    const payload = {
        device_id: deviceID,
        timestamp: moment().toISOString(),
        status: deviceStatus,
    };

    client.publish(topic, JSON.stringify(payload), { qos: 0, retain: false }, (error) => {
        if (error) {
            logger.error(`${deviceID} Erreur lors de la publication du heartbeat: ${error}`);
        } else {
        }
    });
}

/**
 * Gère les commandes de configuration du device.
 * @param {Array} components Les composants du device.
 * @param {object} payload Le payload du message.
 */
function handleDeviceConfig(components, payload) {
    const { component_id, min_threshold, max_threshold } = payload;
    const targetComponent = components.find(c => c.component_id === component_id);

    if (targetComponent && targetComponent.component_type === 'sensor') {
        targetComponent.min_threshold = parseFloat(min_threshold);
        targetComponent.max_threshold = parseFloat(max_threshold);
        logger.info(`Config. mise à jour pour le composant '${targetComponent.component_id}': min=${targetComponent.min_threshold}, max=${targetComponent.max_threshold}`);
    } else {
        logger.warn(`Composant '${component_id}' non trouvé ou n'est pas un capteur pour la configuration.`);
    }
}

/**
 * Gère la commande de réinitialisation du compteur d'un composant.
 * @param {object} client Le client MQTT.
 * @param {string} deviceID L'ID du device.
 * @param {string} statusTopic Le topic de statut.
 * @param {Array} components Les composants du device.
 * @param {string} component_id L'ID du composant à réinitialiser.
 */
function handleResetComponentTimer(client, deviceID, statusTopic, components, component_id) {
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
            component_id: component_id,
            status: 'reset_failed',
            error: 'Component not found',
            timestamp: moment().toISOString()
        }), { qos: 1 });
    }
}

/**
 * Publie les heures de fonctionnement des composants via MQTT.
 * @param {object} client Le client MQTT.
 * @param {string} deviceID L'ID du device.
 * @param {string} topic Le topic des heures de fonctionnement.
 * @param {Array} components Les composants du device.
 */
function publishComponentRunningHoursToMQTT(client, deviceID, topic, components) {
    const timestamp = moment().toISOString();
    components.forEach(component => {
        if (component.status !== 'obsolete') {
            const payload = {
                device_id: deviceID,
                component_id: component.component_id,
                running_hours: parseFloat(component.running_hours.toFixed(0)),
                timestamp: timestamp,
            };

            client.publish(topic, JSON.stringify(payload), { qos: 1 }, (error) => {
                if (error) {
                    logger.error(`${deviceID} Erreur lors de la publication des heures de fonctionnement: ${error}`);
                } else {
                }
            });
        }
    });
}

module.exports = {
    publishDeviceStatus,
    publishAvailability,
    publishHeartbeat,
    handleDeviceConfig,
    handleResetComponentTimer,
    publishComponentRunningHoursToMQTT
};
