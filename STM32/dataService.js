const moment = require('moment');
const axios = require('axios');

// Declare authToken here to make it accessible to all functions.
let authToken = null;

/**
 * Sets the authentication token.
 *
 * @param {string} token The token to be stored.
 */
const setAuthToken = (token) => {
    authToken = token;
    console.log("Authentication token has been set.");
};

/**
 * Generates new simulated data for a given component.
 *
 * @param {object} component The component object to generate data for.
 * @returns {number} The new value of the component.
 */
const generateData = (component) => {
    let newValue = component.currentValue + (Math.random() - 0.5) * component.variance;
    component.currentValue = newValue;
    return newValue;
};

/**
 * Publishes data for each component, updates running hours, and checks for alerts.
 *
 * @param {object} client The MQTT client instance.
 * @param {string} deviceID The unique ID of the device.
 * @param {string} deviceLocation The location of the device.
 * @param {Array<object>} components The list of components to process.
 * @param {number} simulatedHours The number of hours to add to the running time.
 * @param {string} alertTopicBase The base topic for alerts.
 * @param {string} runningHoursTopic The topic for running hours updates.
 */
const publishComponentData = async (
    client,
    deviceID,
    deviceLocation,
    components,
    simulatedHours,
    alertTopicBase,
    runningHoursTopic,
) => {
    // Check for token before making the request
    if (!authToken) {
        console.error("Error: Auth token is not set. Cannot publish component data.");
        return;
    }

    const timestamp = moment().toISOString();

    // Publish data for each component using POST request
    const apiUrl = `http://influxdb.flamware.work/influxdb/sensordata/${deviceID}/${deviceLocation}`;

    const sensors = components.filter(c => c.component_type === 'sensor');
    const dataPayload = sensors.map(component => {
        const value = generateData(component);
        return {
            device_id: deviceID,
            location_id: deviceLocation,
            sensor_id: component.component_id,
            value: parseFloat(value.toFixed(2)), // keep 2 decimals but as number
            field: component.component_subtype,
            timestamp: timestamp,
        };
    });
    console.log(`Prepared component data payload: ${JSON.stringify(dataPayload)}`);

    try {
        await axios.post(apiUrl, dataPayload, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        console.log(`Published component data to InfluxDB: ${JSON.stringify(dataPayload)}`);
    } catch (error) {
        console.error(`Error publishing component data to InfluxDB: ${error.message}`);
    }

    // Check each component for alerts and update running hours
    components.forEach(component => {
        const value = component.currentValue; // get the updated value

        // Alert if the value is outside the defined range
        if ((component.min_threshold !== undefined && value < component.min_threshold) ||
            (component.max_threshold !== undefined && value > component.max_threshold)) {

            if (!component.value_alert_sent) {
                const alertPayload = {
                    device_id: deviceID,
                    component_id: component.component_id,
                    value: parseFloat(value.toFixed(2)),
                    alert: `Component ${component.component_id} value is outside the acceptable range.`,
                    timestamp: timestamp
                };
                const alertTopic = `${alertTopicBase}/${deviceID}`;
                client.publish(alertTopic, JSON.stringify(alertPayload), { qos: 1 });
                console.log(`ALERT: Published 'VALUE_OUT_OF_RANGE' alert for ${component.component_id}`);
                component.value_alert_sent = true;
            }
        } else if (component.value_alert_sent) {
            // Reset alert flag if value returns to normal
            component.value_alert_sent = false;
            console.log(`INFO: Value for ${component.component_id} is back in the acceptable range. Alert flag reset.`);
        }

        // Update running hours only if the component is active
        if (component.component_status === 'ok') {
            component.current_running_hours += simulatedHours;
        }

        // Alert if running hours exceed the threshold
        if (component.max_running_hours && component.current_running_hours >= component.max_running_hours && !component.alert_sent) {
            const alertPayload = {
                device_id: deviceID,
                component_id: component.component_id,
                alert: `Component ${component.component_id} has exceeded its max running hours. Maintenance required.`,
                timestamp: timestamp
            };
            const alertTopic = `${alertTopicBase}/${deviceID}`;
            client.publish(alertTopic, JSON.stringify(alertPayload), { qos: 1 });
            console.log(`ALERT: Published alert for ${component.component_id} on topic ${alertTopic}`);
            component.alert_sent = true;
        }

        // Publish running hours
        const runningHoursPayload = {
            device_id: deviceID,
            component_id: component.component_id,
            running_hours: component.current_running_hours,
            timestamp: timestamp
        };
        client.publish(runningHoursTopic, JSON.stringify(runningHoursPayload), { qos: 1 });
    });
};

/**
 * Publishes a single message with voltage, current, and calculated power.
 *
 * @param {object} client The MQTT client instance.
 * @param {string} deviceID The device ID
 * @param {string} consumptionTopic The topic for power consumption updates.
 */
const publishConsumptionData = (client, deviceID, consumptionTopic) => {
    // Check for token before making the request
    if (!authToken) {
        console.error("Error: Auth token is not set. Cannot publish consumption data.");
        return;
    }

    const timestamp = moment().toISOString();

    // Simulate voltage and current
    const voltage = 210 + Math.random() * 20;
    const current = Math.random() * 10;

    const power = voltage * current;

    const consumptionPayload = {
        device_id: deviceID,
        voltage: parseFloat(voltage.toFixed(2)),
        current: parseFloat(current.toFixed(2)),
        power: parseFloat(power.toFixed(2)),
        timestamp: timestamp,
    };

    client.publish(consumptionTopic, JSON.stringify(consumptionPayload), { qos: 1 });
    console.log(`Published consumption data to broker: ${JSON.stringify(consumptionPayload)}`);

    //publish to influxdb
    const apiUrl = `http://influxdb.flamware.work/influxdb/metrics/${deviceID}`;
    axios.post(apiUrl, consumptionPayload, {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
        .then(() => {
            console.log(`Published consumption data to InfluxDB: ${JSON.stringify(consumptionPayload)}`);
        })
        .catch(error => {
            console.error(`Error publishing consumption data to InfluxDB: ${error.message}`);
        });
};

module.exports = {
    publishComponentData,
    publishConsumptionData,
    setAuthToken, // Added to the module exports
};