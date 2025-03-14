const https = require('https');
const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 3000 });

// In secure production environments, use environment variables or other secure methods
// to store sensitive API keys.
const APP_ID = "9eb4e5f9905845ff1bfaf39ad5fdf622";
const APP_TOKEN = "8868573252ae977abc3fbbc421f8ae2c41b2c880ce38e988e367f8f10afeb9d4";
const API_BASE = `https://rtc.live.cloudflare.com/v1/apps/${APP_ID}`;

function createCloudflareSession() {
    return new Promise((resolve, reject) => {
        const options = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${APP_TOKEN}`,
                'Content-Type': 'application/json' // important. If you want send empty body
            },
        };

        const req = https.request(`${API_BASE}/sessions/new`, options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        if (res.statusCode === 201) {
                            resolve(parsedData.sessionId); // Resolve with the session ID
                        } else {
                            reject(new Error(`Unexpected status code ${res.statusCode} creating session: ${data}`));
                        }

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

function addTrackToSession(sessionId, trackData) {
    return new Promise((resolve, reject) => {
        const addTrackEndpoint = `${API_BASE}/sessions/${sessionId}/tracks/new`;

        const options = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${APP_TOKEN}`,
                'Content-Type': 'application/json',
            },
        };

        const req = https.request(addTrackEndpoint, options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsedData); // Resolve with the parsed data
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

        //Important: must conform to TracksRequest schema
        const requestBody = JSON.stringify(trackData);

        req.write(requestBody);
        req.end();
    });
}

wss.on('connection', ws => {
    console.log('Client connected');

    ws.on('message', async message => {
        const parsedMessage = JSON.parse(message);

        if (parsedMessage.type === 'joinCall') {
            try {
                const sessionId = await createCloudflareSession();
                ws.send(JSON.stringify({ type: 'sessionCreated', sessionId }));
            } catch (error) {
                console.error('Error creating session:', error);
                ws.send(JSON.stringify({ type: 'error', message: error.message }));
            }
        } else if (parsedMessage.type === 'addTrack') {
            try {
                const { sessionId, trackData } = parsedMessage;  // Expect complete track data
                const trackResponse = await addTrackToSession(sessionId, trackData);
                ws.send(JSON.stringify({ type: 'trackAdded', trackResponse })); // Send data to client
            } catch (error) {
                console.error('Error adding track:', error);
                ws.send(JSON.stringify({ type: 'error', message: error.message }));
            }
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });

    ws.on('error', error => {
        console.error('WebSocket error:', error);
    });
});

console.log('WebSocket server started on port 3000');