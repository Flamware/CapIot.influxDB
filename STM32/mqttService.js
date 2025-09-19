// A simple module to handle common MQTT-related tasks.
const moment = require('moment');

const publishAvailability = (client, deviceID, topic, components, status) => {
    const payload = {
        device_id: deviceID,
        status: status,
        timestamp: moment().toISOString(),
        components: components.map(c => ({
            component_id: c.component_id,
            component_name: c.component_name,
            component_type: c.component_type,
            component_subtype: c.component_subtype,
            status: c.status,
            running_hours: c.running_hours
        }))
    };
    client.publish(topic, JSON.stringify(payload), {
        qos: 1,
        retain: true
    });
};

const publishDeviceStatus = (client, deviceID, topic, status, retain = false) => {
    const payload = {
        device_id: deviceID,
        status: status,
        timestamp: moment().toISOString(),
    };
    client.publish(topic, JSON.stringify(payload), {
        qos: 1,
        retain: retain
    });
};

const publishHeartbeat = (client, deviceID, topic, status) => {
    const payload = {
        device_id: deviceID,
        status: status,
        timestamp: moment().toISOString(),
    };
    client.publish(topic, JSON.stringify(payload), {
        qos: 0
    });
};

const handleDeviceConfig = (components, payload) => {
    if (payload.component_id && payload.status) {
        const component = components.find(c => c.component_id === payload.component_id);
        if (component) {
            component.status = payload.status;
            console.log(`Component ${component.component_id} status updated to ${payload.status}`);
        }
    }
};

const handleResetComponentTimer = (client, deviceID, statusTopic, components, componentId) => {
    const component = components.find(c => c.component_id === componentId);
    if (component) {
        component.running_hours = 0;
        console.log(`Running hours for component ${componentId} reset to 0.`);
    }
    publishDeviceStatus(client, deviceID, statusTopic, 'reset', false);
};

const handleSetComponentHours = (client, deviceID, statusTopic, components, componentId, hours) => {
    const component = components.find(c => c.component_id === componentId);
    if (component) {
        component.running_hours = hours;
        console.log(`Running hours for component ${componentId} set to ${hours}.`);
    }
    publishDeviceStatus(client, deviceID, statusTopic, 'hours_set', false);
};


module.exports = {
    publishAvailability,
    publishDeviceStatus,
    publishHeartbeat,
    handleDeviceConfig,
    handleResetComponentTimer,
    handleSetComponentHours,
};
