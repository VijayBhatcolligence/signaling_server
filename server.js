const https = require('https'); // Import the https module
const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 3000 });

APP_ID = "9eb4e5f9905845ff1bfaf39ad5fdf622";
const APP_TOKEN = "8868573252ae977abc3fbbc421f8ae2c41b2c880ce38e988e367f8f10afeb9d4";
const API_BASE = `https://rtc.live.cloudflare.com/v1/apps/${APP_ID}`;

const activeSessions = {};

function createCloudflareSession() {
    return new Promise((resolve, reject) => {
        const options = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${APP_TOKEN}`,
            },
        };
        console.log(API_BASE, options, "options");
        const req = https.request(`${API_BASE}/sessions/new`, options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsedData.sessionId);
                    } else {
                        reject(new Error(`API request failed with status ${res.statusCode}: ${data}`));
                    }
                } catch (parseError) {
                    reject(new Error(`Error parsing JSON response: ${parseError}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.end(); // Important: Signal that the request body is complete (even if empty)
    });
}

function whip(sessionId, sdpOffer) {
    return new Promise((resolve, reject) => {
        const whipEndpoint = `${API_BASE}/sessions/${sessionId}/whip`;

        const options = {
            method: 'POST',  //  <---  MUST BE 'POST' (or 'PUT' if Cloudflare requires it)
            headers: {
                'Authorization': `Bearer ${APP_TOKEN}`,
                'Content-Type': 'application/sdp',  //  <---  MUST BE 'application/sdp'
            },
        };

        const req = https.request(whipEndpoint, options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ sdpAnswer: data, location: res.headers.location }); // Include the Location header
                } else {
                    reject(new Error(`WHIP request failed with status ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(sdpOffer);  //  <---  SEND THE SDP OFFER IN THE REQUEST BODY
        req.end();
    });
}

function whep(sessionId, sdpOffer) {
    return new Promise((resolve, reject) => {
        const whepEndpoint = `${API_BASE}/sessions/${sessionId}/whep`;

        const options = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${APP_TOKEN}`,
                'Content-Type': 'application/sdp',
            },
        };

        const req = https.request(whepEndpoint, options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ sdpAnswer: data, location: res.headers.location }); // Include the Location header
                } else {
                    reject(new Error(`WHEP request failed with status ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(sdpOffer);
        req.end();
    });
}


wss.on('connection', ws => {
    let clientId;
    let sessionId;
    let isWhip = false; // Track whether this client is acting as a WHIP client

    ws.on('message', async message => {
        const parsedMessage = JSON.parse(message);

        if (parsedMessage.type === 'joinCall') {
            clientId = parsedMessage.clientId;
            try {
                sessionId = await createCloudflareSession();
                activeSessions[clientId] = { sessionId, ws };
                ws.send(JSON.stringify({ type: 'sessionCreated', sessionId }));
            } catch (error) {
                console.error('Error creating session:', error);
                ws.send(JSON.stringify({ type: 'error', message: error.message }));
                return;
            }
        } else if (parsedMessage.type === 'whipOffer') {
            isWhip = true; // This client is now acting as a WHIP client
            try {
                const { sdpAnswer, location } = await whip(sessionId, parsedMessage.sdpOffer);
                ws.send(JSON.stringify({ type: 'whipAnswer', sdpAnswer: sdpAnswer, location: location }));
            } catch (error) {
                console.error('WHIP Error:', error);
                ws.send(JSON.stringify({ type: 'error', message: `WHIP failed: ${error.message}` }));
            }
        } else if (parsedMessage.type === 'whepOffer') {
            isWhip = false; // This client is NOT acting as a WHIP client (explicitly set it to false)
            try {
                const { sdpAnswer, location } = await whep(sessionId, parsedMessage.sdpOffer);
                ws.send(JSON.stringify({ type: 'whepAnswer', sdpAnswer: sdpAnswer, location: location }));
            } catch (error) {
                console.error('WHEP Error:', error);
                ws.send(JSON.stringify({ type: 'error', message: `WHEP failed: ${error.message}` }));
            }
        }
    });

    ws.on('close', () => {
        if (clientId) {
            delete activeSessions[clientId];
        }
    });
});

console.log('WebSocket server started on port 3000');