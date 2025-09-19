// A simple module to handle data publishing for device components.
const moment = require('moment');

const generateData = (component) => {
    let newValue = component.currentValue + (Math.random() - 0.5) * component.variance;
    // Keep the value within defined min/max range
    if (newValue < component.min) newValue = component.min;
    if (newValue > component.max) newValue = component.max;
    component.currentValue = newValue;
    return newValue;
};

const publishComponentDataToHTTP = (client, deviceID, deviceLocation, components, simulatedHours, alertTopicBase, runningHoursTopic) => {
    const timestamp = moment().toISOString();

    components.forEach(component => {
        if (component.component_type === 'sensor' && ['ok', 'warning'].includes(component.status)) {
            const data = {
                device_id: deviceID,
                location: deviceLocation,
                component_id: component.component_id,
                value: generateData(component),
                timestamp: timestamp
            };
            // In a real application, you would send this to an HTTP endpoint
            // console.log(`[HTTP POST] publishing data for ${component.component_id}:`, data);
        }

        // Update running hours only if the component is active
        if (component.status === 'ok') {
            component.running_hours += simulatedHours;
        }

        // Check for alerts based on component status and value
        if (component.status === 'warning') {
            const alertPayload = {
                device_id: deviceID,
                location: deviceLocation,
                component_id: component.component_id,
                message: `Component ${component.component_id} is in a WARNING state!`,
                timestamp: timestamp
            };
            client.publish(`${alertTopicBase}/${component.component_id}`, JSON.stringify(alertPayload), { qos: 1 });
        } else if (component.status === 'fault') {
            const alertPayload = {
                device_id: deviceID,
                location: deviceLocation,
                component_id: component.component_id,
                message: `Component ${component.component_id} has a FAULT!`,
                timestamp: timestamp
            };
            client.publish(`${alertTopicBase}/${component.component_id}`, JSON.stringify(alertPayload), { qos: 1 });
        }

        // Publish running hours
        const runningHoursPayload = {
            device_id: deviceID,
            component_id: component.component_id,
            running_hours: component.running_hours,
            timestamp: timestamp
        };
        client.publish(runningHoursTopic, JSON.stringify(runningHoursPayload), { qos: 1 });
    });
};

module.exports = {
    publishComponentDataToHTTP,
};
