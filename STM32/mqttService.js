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
            status: c.component_status,
            running_hours: c.current_running_hours
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
    if (!payload.component_id) {
        console.error("Configuration payload is missing component_id.");
        return;
    }
    const component = components.find(c => c.component_id === payload.component_id);
    if (component) {
        // Update specific configurable properties if they exist in the payload
        if (payload.status !== undefined) {
            component.component_status = payload.status;
            console.log(`Component ${component.component_id} status updated to ${payload.status}`);
        }
        if (payload.min_threshold !== undefined) {
            component.min_threshold = payload.min_threshold;
            console.log(`Component ${component.component_id} min_threshold updated to ${payload.min_threshold}`);
        }
        if (payload.max_threshold !== undefined) {
            component.max_threshold = payload.max_threshold;
            console.log(`Component ${component.component_id} max_threshold updated to ${payload.max_threshold}`);
        }
        if (payload.max_running_hours !== undefined) {
            component.max_running_hours = payload.max_running_hours;
            console.log(`Component ${component.component_id} max_running_hours updated to ${payload.max_running_hours}`);
        }
    } else {
        console.warn(`Component with ID ${payload.component_id} not found.`);
    }
};

const handleResetComponentTimer = (client, deviceID, statusTopic, components, componentId) => {
    const component = components.find(c => c.component_id === componentId);
    if (component) {
        component.current_running_hours = 0;
        console.log(`Running hours for component ${componentId} reset to 0.`);
    }
};

const handleSetComponentHours = (client, deviceID, statusTopic, components, componentId, hours) => {
    const component = components.find(c => c.component_id === componentId);
    if (component && typeof hours === 'number' && hours >= 0) {
        component.current_running_hours = hours;
        console.log(`Running hours for component ${componentId} set to ${hours}.`);
    } else {
        console.error(`Invalid 'set_hours' command for component ${componentId}. Hours must be a valid number.`);
    }
};

module.exports = {
    publishAvailability,
    publishDeviceStatus,
    publishHeartbeat,
    handleDeviceConfig,
    handleResetComponentTimer,
    handleSetComponentHours,
};
