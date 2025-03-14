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

        console.log(`[Server] 📞 Calling Cloudflare API: POST ${API_BASE}/sessions/new`);

        const req = https.request(`${API_BASE}/sessions/new`, options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        const sessionId = parsedData.sessionId;
                        console.log(`[Server] ✅ Cloudflare API: Session created successfully with ID: ${sessionId}`);
                        resolve(sessionId);
                    } else {
                        console.error(`[Server] ❌ Cloudflare API: Session creation failed with status ${res.statusCode}`);
                        console.error(`[Server] ❌ Error description: ${parsedData.errorDescription}`);
                        reject(new Error(`Session creation failed with status ${res.statusCode}: ${parsedData.errorDescription}`));
                    }
                } catch (parseError) {
                    console.error("[Server] ❌ JSON Parsing Error:", parseError.message);
                    reject(new Error(`Error parsing JSON response: ${parseError.message}`));
                }
            });
        });

        req.on('error', (error) => {
            console.error("[Server] ⚠️ Request Error:", error);
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

        console.log(`[Server] 📞 Calling Cloudflare API: POST ${API_BASE}/sessions/${sessionId}/tracks/new`);
        console.log(`[Server] 📤 Request Body (addTrack): trackName: ${trackData.tracks[0].trackName}, mid: ${trackData.tracks[0].mid}`);

        const req = https.request(`${API_BASE}/sessions/${sessionId}/tracks/new`, options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        console.log(`[Server] ✅ Cloudflare API: Track added successfully: ${parsedData.tracks[0].trackName}`);
                        resolve(parsedData);
                    } else {
                        console.error(`[Server] ❌ Cloudflare API: Adding track failed with status ${res.statusCode}`);
                        console.error(`[Server] ❌ Error description: ${parsedData.errorDescription}`);
                        reject(new Error(`Adding track failed with status ${res.statusCode}: ${parsedData.errorDescription}`));
                    }
                } catch (parseError) {
                    console.error("[Server] ❌ JSON Parsing Error:", parseError.message);
                    reject(new Error(`Error parsing JSON response: ${parseError.message}`));
                }
            });
        });

        req.on('error', (error) => {
            console.error("[Server] ⚠️ Request Error:", error);
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
        console.log(`[Server] Received message:`, message);
        const parsedMessage = JSON.parse(message);

        if (parsedMessage.type === 'joinCall') {
            clientId = parsedMessage.clientId;
            roomId = parsedMessage.roomId || "default-room"; // Use default room if none provided

            console.log(`[Server] Client ${clientId} attempting to join room ${roomId}`);

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

                console.log(`[Server] Client ${clientId} joined room ${roomId} with session ${sessionId}`);

                try {
                    const addTrackResponse = await addTrackToCloudflareSession(sessionId, trackData);
                    ws.send(JSON.stringify({
                        type: 'trackAdded',
                        response: addTrackResponse,
                        sessionId: sessionId
                    }));

                    // Notify other clients in the room about the new client
                    for (const remoteClientId in rooms[roomId]) {
                        if (remoteClientId !== clientId) {
                            ws.send(JSON.stringify({
                                type: 'remoteClientConnected',
                                clientId: clientId
                            }));
                            console.log(`[Server] 📢 Notifying client ${remoteClientId} about new client ${clientId}`);
                        }
                    }

                } catch (trackError) {
                    console.error(`[Server] Error adding track for ${clientId}:`, trackError);
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: trackError.message
                    }));
                }

            } catch (sessionError) {
                console.error(`[Server] Error creating session for ${clientId}:`, sessionError);
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
            console.log(`[Server] Client ${clientId} left room ${roomId}`);
        }
    });
    ws.on('error', (error) => {
        console.error("[Server] WebSocket error:", error);
    });
});

console.log('🚀 WebSocket server started on port 3000');