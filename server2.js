const https = require('https');
const WebSocket = require('ws');

const wss = new WebSocket.Server({
    port: 3000
});

const APP_ID = "9eb4e5f9905845ff1bfaf39ad5fdf622"; // Replace with your Cloudflare App ID
const APP_TOKEN = "8868573252ae977abc3fbbc421f8ae2c41b2c880ce38e988e367f8f10afeb9d4"; // Replace with your Cloudflare App Token
const API_BASE = `https://rtc.live.cloudflare.com/v1/apps/${APP_ID}`;

// Store clients by room ID
const rooms = {};

function createCloudflareSession() {
    return new Promise((resolve, reject) => {
        const options = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${APP_TOKEN}`,
            },
        };

        console.log(`Creating session at ${API_BASE}/sessions/new`);

        const req = https.request(`${API_BASE}/sessions/new`, options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                console.log("📩 Raw API Response (createSession):", data);

                try {
                    const parsedData = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        const sessionId = parsedData.sessionId;
                        console.log(`✅ Session created successfully with ID: ${sessionId}`);
                        resolve(sessionId);
                    } else {
                        console.error(`❌ API request failed with status ${res.statusCode}: ${data}`);
                        reject(new Error(`API request failed with status ${res.statusCode}: ${data}`));
                    }
                } catch (parseError) {
                    console.error("❌ JSON Parsing Error:", parseError.message);
                    reject(error);
                }
            });
        });

        req.on('error', (error) => {
            console.error("⚠️ Request Error:", error);
            reject(error);
        });

        req.end();
    });
}

function addTrackToCloudflareSession(sessionId, trackData) {
    return new Promise((resolve, reject) => {
        const options = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${APP_TOKEN}`,
                'Content-Type': 'application/json',
            },
        };

        const requestBody = JSON.stringify(trackData);

        console.log(`Adding track to session ${sessionId} at ${API_BASE}/sessions/${sessionId}/tracks/new`);
        console.log("📤 Request Body (addTrack):", requestBody);

        const req = https.request(`${API_BASE}/sessions/${sessionId}/tracks/new`, options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                console.log("📩 Raw API Response (addTrack):", data);

                try {
                    const parsedData = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        console.log("✅ Track added successfully:", parsedData);
                        resolve(parsedData);
                    } else {
                        console.error(`❌ API request failed with status ${res.statusCode}: ${data}`);
                        reject(new Error(`API request failed with status ${res.statusCode}: ${data}`));
                    }
                } catch (parseError) {
                    console.error("❌ JSON Parsing Error:", parseError.message);
                    reject(error);
                }
            });
        });

        req.on('error', (error) => {
            console.error("⚠️ Request Error:", error);
            reject(error);
        });

        req.write(requestBody);
        req.end();
    });
}

wss.on('connection', ws => {
    let clientId;
    let sessionId;
    let roomId; // Keep track of the room
    ws.on('message', async message => {
        console.log(`Received message: ${message}`);
        const parsedMessage = JSON.parse(message);

        if (parsedMessage.type === 'joinCall') {
            clientId = parsedMessage.clientId;
            roomId = parsedMessage.roomId || "default-room"; // Use default room if none provided

            try {
                sessionId = await createCloudflareSession();
                const trackData = parsedMessage.trackData;

                // Add client to the room
                if (!rooms[roomId]) {
                    rooms[roomId] = {};
                }
                rooms[roomId][clientId] = {
                    ws,
                    sessionId
                };

                console.log(`Client ${clientId} joined room ${roomId} with session ${sessionId}`);

                try {
                    const addTrackResponse = await addTrackToCloudflareSession(sessionId, trackData);
                    ws.send(JSON.stringify({
                        type: 'trackAdded',
                        response: addTrackResponse,
                        sessionId: sessionId  //Send back sessionid, so the client can access it!
                    }));

                    // Notify other clients in the room about the new client, forward to CF new Code.
                    for (const remoteClientId in rooms[roomId]) {
                        if (remoteClientId !== clientId) {
                            rooms[remoteClientId].ws.send(JSON.stringify({
                                type: 'remoteClientConnected',
                                clientId: clientId
                            }));
                        }
                    }

                } catch (trackError) {
                    console.error('Error adding track:', trackError);
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: trackError.message
                    }));
                }

            } catch (sessionError) {
                console.error('Error creating session:', sessionError);
                ws.send(JSON.stringify({
                    type: 'error',
                    message: sessionError.message
                }));
            }
        }
    });

    ws.on('close', () => {
        if (clientId && roomId && rooms[roomId] && rooms[roomId][clientId]) {
            delete rooms[roomId][clientId];
            console.log(`Client ${clientId} left room ${roomId}`);
        }
    });
    ws.on('error', (error) => {
        console.error("WebSocket error:", error);
    });
});

console.log('🚀 WebSocket server started on port 3000');