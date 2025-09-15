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
        // Ces champs sont ajoutés pour que le tableau de bord sache qu'ils sont configurables.
        min_threshold: component.min_threshold,
        max_threshold: component.max_threshold,
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
 * Gère les commandes de configuration du device pour les seuils et les heures de fonctionnement.
 * @param {Array} components Les composants du device.
 * @param {object} payload Le payload du message.
 */
function handleDeviceConfig(components, payload) {
    const { component_id, min_threshold, max_threshold, max_running_hours } = payload;
    const targetComponent = components.find(c => c.component_id === component_id);

    if (!targetComponent) {
        logger.warn(`Composant '${component_id}' non trouvé pour la configuration.`);
        return;
    }

    if (min_threshold !== undefined && max_threshold !== undefined) {
        // La configuration des seuils ne s'applique qu'aux capteurs
        if (targetComponent.component_type === 'sensor') {
            targetComponent.min_threshold = parseFloat(min_threshold);
            targetComponent.max_threshold = parseFloat(max_threshold);
            logger.info(`Config. mise à jour pour le capteur '${targetComponent.component_id}': min=${targetComponent.min_threshold}, max=${targetComponent.max_threshold}`);
        } else {
            logger.warn(`Configuration de seuils reçue pour le composant non-capteur '${targetComponent.component_id}'.`);
        }
    }

    if (max_running_hours !== undefined) {
        // La configuration des heures de fonctionnement s'applique à tous les types de composants
        targetComponent.max_running_hours = parseFloat(max_running_hours);
        logger.info(`Config. mise à jour pour le composant '${targetComponent.component_id}': max_running_hours=${targetComponent.max_running_hours}`);
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
 * Gère la commande de mise à jour des heures de fonctionnement d'un composant.
 * @param {object} client Le client MQTT.
 * @param {string} deviceID L'ID du device.
 * @param {string} statusTopic Le topic de statut.
 * @param {Array} components Les composants du device.
 * @param {string} component_id L'ID du composant à mettre à jour.
 * @param {number} hours La nouvelle valeur des heures de fonctionnement.
 */
function handleSetComponentHours(client, deviceID, statusTopic, components, component_id, hours) {
    const targetComponent = components.find(c => c.component_id === component_id);

    if (targetComponent) {
        targetComponent.running_hours = parseFloat(hours);
        logger.info(`${deviceID} Heures de fonctionnement du composant '${targetComponent.component_id}' mises à jour: ${targetComponent.running_hours}.`);
        client.publish(`${statusTopic}/set_hours`, JSON.stringify({
            device_id: deviceID,
            component_id: targetComponent.component_id,
            running_hours: targetComponent.running_hours,
            status: 'set_success',
            timestamp: moment().toISOString()
        }), { qos: 1 });
    } else {
        logger.warn(`${deviceID} Impossible de mettre à jour les heures de fonctionnement: Composant '${component_id}' non trouvé.`);
        client.publish(`${statusTopic}/set_hours`, JSON.stringify({
            device_id: deviceID,
            component_id: component_id,
            status: 'set_failed',
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
    handleSetComponentHours,
    publishComponentRunningHoursToMQTT
};
