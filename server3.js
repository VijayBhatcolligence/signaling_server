const https = require('https');
const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 3000 });

const APP_ID = "9eb4e5f9905845ff1bfaf39ad5fdf622";
const APP_TOKEN = "8868573252ae977abc3fbbc421f8ae2c41b2c880ce38e988e367f8f10afeb9d4";
const API_BASE = `https://rtc.live.cloudflare.com/v1/apps/${APP_ID}`;

const rooms = {}; // Store clients by room

function createCloudflareSession() {
    return new Promise((resolve, reject) => {
        const options = {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${APP_TOKEN}` },
        };

        const req = https.request(`${API_BASE}/sessions/new`, options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(data);
                    res.statusCode < 300 ? resolve(parsedData.sessionId) : reject(new Error(parsedData.errorDescription));
                } catch (error) { reject(error); }
            });
        });
        req.on('error', reject);
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

        const req = https.request(`${API_BASE}/sessions/${sessionId}/tracks/new`, options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(data);
                    console.log("[Server] Cloudflare Answer SDP reached");
                    console.log("set description done nad cloudflare is receveing my audio and veio")
                    res.statusCode < 300 ? resolve(parsedData) : reject(new Error(parsedData.errorDescription));
                } catch (error) { reject(error); }
            });
        });
        req.on('error', reject);
        req.write(JSON.stringify(trackData));
        console.log("[Server] Offer sent to Cloudflare");
        req.end();
    });
}

wss.on('connection', ws => {
    let clientId, sessionId, roomId;

    ws.on('message', async message => {
        const parsedMessage = JSON.parse(message);
        const type = parsedMessage.type; // Extract message type

        switch (type) {
            case 'joinCall':
                clientId = parsedMessage.clientId;
                roomId = parsedMessage.roomId || "default-room";

                if (!rooms[roomId]) rooms[roomId] = {};

                try {
                    sessionId = await createCloudflareSession(); // create cloudflare session
                    console.log(`Client ${clientId} created Cloudflare session ${sessionId}`);

                    const trackData = parsedMessage.trackData;
                    rooms[roomId][clientId] = { ws, sessionId, trackData };

                    const addTrackResponse = await addTrackToCloudflareSession(sessionId, trackData); // add track to cloudflare seesion
                    ws.send(JSON.stringify({ type: 'trackAdded', response: addTrackResponse, sessionId }));// send trackadded to client

                    // Notify existing clients about the new client
                    for (const remoteClientId in rooms[roomId]) {
                        if (remoteClientId !== clientId) {
                            const remoteClient = rooms[roomId][remoteClientId].ws;
                            remoteClient.send(JSON.stringify({
                                type: 'remoteClientConnected',
                                clientId: clientId
                            }));

                            // Notify the new client about existing clients
                            ws.send(JSON.stringify({
                                type: 'remoteClientConnected',
                                clientId: remoteClientId
                            }));
                        }
                    }
                } catch (error) {
                    console.error("Error during joinCall:", error);
                    ws.send(JSON.stringify({ type: 'error', message: error.message }));
                }
                break;
            case 'offer':
            case 'answer':
            case 'iceCandidate':
                // Route offer, answer, and iceCandidate messages to the specified remote client
                const remoteClientId = parsedMessage.remoteClientId;
                if (!remoteClientId) {
                    console.warn(`[Server] Missing remoteClientId in ${type} message.`);
                    return;
                }
                if (!rooms[roomId] || !rooms[roomId][remoteClientId]) {
                    console.warn(`[Server] Client ${remoteClientId} not found in room ${roomId} for ${type} message.`);
                    return;
                }

                const targetClient = rooms[roomId][remoteClientId].ws;
                if (targetClient && targetClient.readyState === WebSocket.OPEN) {
                    targetClient.send(JSON.stringify(parsedMessage)); // Forward the message
                    console.log(`[Server] Forwarded ${type} from ${clientId} to ${remoteClientId}`);
                } else {
                    console.log(`[Server] Target client ${remoteClientId} not found or not connected for ${type} message.`);
                }
                break;

            default:
                console.log(`[Server] Received unknown message type: ${type}`);
        }
    });

    ws.on('close', () => {
        if (rooms[roomId] && rooms[roomId][clientId]) {
            delete rooms[roomId][clientId];
            console.log(`Client ${clientId} disconnected from room ${roomId}`);
        }
    });

    ws.on('error', console.error);
});

console.log('🚀 WebSocket server started on port 3000');