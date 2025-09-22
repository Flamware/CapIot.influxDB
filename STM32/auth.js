const axios = require('axios');

/**
 * @param {string} deviceID The unique ID of the device.
 * @param {string} apiProvisioningUrl The URL for the provisioning endpoint.
 * @returns {Promise<string>} The connection token received from the API.
 */
let authToken = null; // Variable to store the authentication token

const getProvisioningToken = async (deviceID, apiProvisioningUrl) => {
    try {
        console.log(`Starting device provisioning for device ${deviceID}...`);

        // Make the POST request to the provisioning endpoint with the deviceID in the body
        const response = await axios.post(apiProvisioningUrl, {
            deviceID: deviceID,
        });

        const token = response.data.provisioning_token;
        if (!token) {
            throw new Error('Provisioning response did not contain a token.');
        }

        console.log(`Successfully received provisioning token for device ${deviceID}.`);
        return token;
    } catch (error) {
        // Correctly handle the error response from the Go API
        let errorMessage = `Error during device provisioning for ${deviceID}: ${error.message}`;

        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx.
            const serverErrorMessage = error.response.data;
            const statusCode = error.response.status;
            errorMessage = `Server responded with status ${statusCode}: ${serverErrorMessage}`;
        } else if (error.request) {
            // The request was made but no response was received.
            errorMessage = `No response received from the server. It might be down or unreachable.`;
        }

        console.error(errorMessage);
        throw new Error(errorMessage);
    }
};

module.exports = {
    getProvisioningToken, // Added to the module exports
};