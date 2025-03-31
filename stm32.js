// Simulate sensor data
function getSensorData() {
    return {
        temperature: (Math.random() * 40).toFixed(2), // Temperature range: 0-40°C
        humidity: (Math.random() * 100).toFixed(2),   // Humidity range: 0-100%
        location_id: "location_123",                 // Replace with actual location ID
        device_id: "STM32_Device_456"                // Replace with actual device ID
    };
}

// Simulate TPM 2.0 signing (replace with actual TPM interaction)
function simulateTPMSign(data) {
    const hash = simpleHash(JSON.stringify(data));

    return {
        signature: hash,              // Simulated TPM signature
        publicKey, // Replace with actual TPM public key
        certInfo: "SIMULATED_CERTIFICATE_INFO" // Certificate information (if applicable)
    };
}

// Simple (insecure) hash function for simulation purposes
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
}

// Check if device is already registered
async function isDeviceRegistered(deviceID) {
    try {
        const response = await fetch(`http://localhost:8081/devices/${deviceID}/tpm2/public_key`, {
            method: "GET",
            headers: { "Content-Type": "application/json" }
        });

        if (response.status === 200) {
            console.log(`Device ${deviceID} is already registered.`);
            return true;
        } else if (response.status === 404) {
            console.log(`Device ${deviceID} is NOT registered. Registering now...`);
            return false;
        } else {
            throw new Error(`Unexpected response: ${response.status}`);
        }
    } catch (error) {
        console.error("Error checking device registration:", error);
        return false;
    }
}

// Register TPM 2.0 public key in Redis
async function registerDevicePublicKey(deviceID, publicKey) {
    const isRegistered = await isDeviceRegistered(deviceID);
    if (isRegistered) return; // Skip registration if already registered

    const payload = { publicKey };

    try {
        const response = await fetch(`http://localhost:8081/devices/${deviceID}/tpm2/public_key`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        console.log(`Device ${deviceID} registered successfully with TPM public key.`);
    } catch (error) {
        console.error("Error registering TPM public key:", error);
    }
}

// Send sensor data and TPM 2.0 signature to API
async function sendDataToAPI(data, signature, publicKey, certInfo) {
    const payload = {
        data,
        signature,
        certInfo,
        timestamp: new Date().toISOString() // Optional timestamp for validity
    };

    try {
        const response = await fetch("http://localhost:8081/write", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "TPM2-Auth": signature // TPM 2.0 authentication header
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const responseData = await response.json();
        console.log("API response:", responseData);
    } catch (error) {
        console.error("Error sending data to API:", error);
    }
}

// Main execution
(async function () {
    const sensorData = getSensorData();
    const { signature, publicKey, certInfo } = simulateTPMSign(sensorData);

    // Step 1: Register TPM 2.0 public key (if needed)
    await registerDevicePublicKey(sensorData.device_id, publicKey);

    // Step 2: Send sensor data with TPM 2.0 signature
    await sendDataToAPI(sensorData, signature, publicKey, certInfo);
})();
