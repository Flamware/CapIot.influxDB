const request = require('request');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TOKEN_FILE = path.join(__dirname, 'tokens.json');

// Function to get a unique Auth0 token for each appareil
const getAuth0Token = async (deviceId, locationId, existingTokens = {}) => {
    if (existingTokens[deviceId] && existingTokens[deviceId].expires_at > Date.now()) {
        console.log("Existing token used");
        console.log("Expiration date: " + new Date(existingTokens[deviceId].expires_at));
        return existingTokens[deviceId];
    }

    const options = {
        method: 'POST',
        url: 'https://dev-4lulwpdfi20wh1ku.us.auth0.com/oauth/token',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            client_id: 'UGNBa9sbt6sUaYpHhMpUx2Zvw2tpIQI3',
            client_secret: 'vY6OWfEpyARQ63QSMFqgit8UKOptzHNNe7jYHOsiz2cWSYw38eg7er_bqK8m6l_s',
            audience: 'http://localhost:8081/',
            grant_type: 'client_credentials',
            device_id: deviceId,
            location_id_for_auth0: locationId,
        }),
    };

    return new Promise((resolve, reject) => {
        request(options, (error, response, body) => {
            if (error) return reject(error);
            try {
                const responseBody = JSON.parse(body);
                const expires_in = responseBody.expires_in;
                const expires_at = Date.now() + expires_in * 1000;

                resolve({ access_token: responseBody.access_token, expires_at: expires_at });
            } catch (parseError) {
                reject(parseError);
            }
        });
    });
};

const sendDataToInfluxDB = async (token, deviceId, locationId) => {
    const now = new Date();
    const data = {
        device_id: deviceId,
        temperature: Math.random() * 30 + 15,
        humidity: Math.random() * 50 + 30,
        location_id: locationId,
        timestamp: now.toISOString(),
    };

    const influxData = {
        method: 'POST',
        url: 'http://localhost:8081/write',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        data: JSON.stringify(data),
    };

    try {
        const response = await axios(influxData);
    } catch (error) {
        console.error(`Error sending data to InfluxDB for ${deviceId} (Location: ${locationId}):`, error);
    }
};

const loadTokensFromFile = () => {
    try {
        const data = fs.readFileSync(TOKEN_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
};

const saveTokensToFile = (tokens) => {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens));
};

const simulateSTM32Fleet = async () => {
    try {
        console.log('Simulating a fleet of STM32 devices for 10 locations every 10 seconds...');

        const locationIds = ['location1'];
        const appareilsPerLocation = 5;

        let tokens = loadTokensFromFile();

        for (const locationId of locationIds) {
            for (let i = 1; i <= appareilsPerLocation; i++) {
                const deviceId = `${locationId}_device${i}`;
                tokens[deviceId] = await getAuth0Token(deviceId, locationId, tokens);
            }
        }

        saveTokensToFile(tokens);

        setInterval(async () => {
            tokens = loadTokensFromFile();
            for (const locationId of locationIds) {
                for (let i = 1; i <= appareilsPerLocation; i++) {
                    const deviceId = `${locationId}_appareil${i}`;
                    const tokenResult = await getAuth0Token(deviceId, locationId, tokens);
                    tokens[deviceId] = tokenResult;
                    saveTokensToFile(tokens);
                    await sendDataToInfluxDB(tokens[deviceId].access_token, deviceId, locationId);
                }
            }
        }, 10000);

    } catch (error) {
        console.error('Error during simulation setup:', error);
    }
};

simulateSTM32Fleet();