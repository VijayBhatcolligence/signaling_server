const https = require('https');
const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 3000 });

const APP_ID = "9eb4e5f9905845ff1bfaf39ad5fdf622";
const APP_TOKEN = "8868573252ae977abc3fbbc421f8ae2c41b2c880ce38e988e367f8f10afeb9d4";
const API_BASE = `https://rtc.live.cloudflare.com/v1/apps/${APP_ID}`;

const rooms = {}; // Store clients by room
wss.on("connection", (ws) => { 
    ws.on("message", (data) => {
        try {
            const message = JSON.parse(data);
            const { roomId, clientId, targetClientId, sdp } = message;

            if (!rooms[roomId]) {
                rooms[roomId] = {};
            }

            if (message.type === "sdpAnswer") {
                // Store SDP answer for this client
                rooms[roomId][clientId] = { ws, sdp };

                // Send the SDP answer ONLY to the intended target client
                if (targetClientId && rooms[roomId][targetClientId]) {
                    rooms[roomId][targetClientId].ws.send(JSON.stringify({
                        type: "sdpAnswer",
                        sdp: sdp,
                        senderClientId: clientId  // Let the receiver know who sent the SDP
                    }));
                }
            }

            if (message.type === "joinRoom") {
                rooms[roomId][clientId] = { ws };

                // 🚀 Send existing SDP answers to the newly joined client
                for (const remoteClientId in rooms[roomId]) {
                    if (remoteClientId !== clientId && rooms[roomId][remoteClientId].sdp) {
                        ws.send(JSON.stringify({
                            type: "sdpAnswer",
                            sdp: rooms[roomId][remoteClientId].sdp,
                            senderClientId: remoteClientId  // Indicate which client sent the SDP
                        }));
                    }
                }
            }
        } catch (error) {
            console.error("Error handling message:", error);
        }
    });
});

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
        if (parsedMessage.type === 'joinCall') {
            clientId = parsedMessage.clientId;
            roomId = parsedMessage.roomId || "default-room";

            if (!rooms[roomId]) rooms[roomId] = {};
            
            try {
                sessionId = await createCloudflareSession();
                const trackData = parsedMessage.trackData;
                rooms[roomId][clientId] = { ws, sessionId, trackData };
                
                const addTrackResponse = await addTrackToCloudflareSession(sessionId, trackData);
                ws.send(JSON.stringify({ type: 'trackAdded', response: addTrackResponse, sessionId }));
                
                for (const remoteClientId in rooms[roomId]) {
                    if (remoteClientId !== clientId) {
                        rooms[roomId][remoteClientId].ws.send(JSON.stringify({
                            type: 'remoteClientConnected', clientId, sessionId, trackData
                        }));
                        ws.send(JSON.stringify({
                            type: 'remoteClientConnected',
                            clientId: remoteClientId,
                            sessionId: rooms[roomId][remoteClientId].sessionId,
                            trackData: rooms[roomId][remoteClientId].trackData
                        }));
                    }
                }
            } catch (error) {
                ws.send(JSON.stringify({ type: 'error', message: error.message }));
            }
        }
    });     

    ws.on('close', () => { if (rooms[roomId] && rooms[roomId][clientId]) delete rooms[roomId][clientId]; });
    ws.on('error', console.error);
});

wss.on("connection", (ws) => {
    ws.on("message", async (data) => { 
        try {
            const message = JSON.parse(data);

            if (message.type === "pullTracks") {
                const { sessionId, body } = message;
                console.log("[Server] Pulling tracks for session:", sessionId);
                console.log("[Server] Received track request:", body);
                
                const tracksToPull = body.tracks.map(track => ({
                    location: "remote",
                    trackName: track.trackName,
                    sessionId: track.sessionId || sessionId
                }));

                console.log("[Server] Sending API Request with tracks:", tracksToPull);
                
                const options = {
                    method: "POST",
                    headers: {
                        'Authorization': `Bearer ${APP_TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ tracks: tracksToPull })
                };
                console.log(options);
                
                const req = https.request(`${API_BASE}/sessions/${sessionId}/tracks/new`, options, (res) => {
                    let responseData = '';
                    res.on('data', (chunk) => { responseData += chunk; });
                    res.on('end', () => {
                        try {
                            const pullResponse = JSON.parse(responseData);
                            console.log("[Server] ✅ Pull response received:", pullResponse);
                            ws.send(JSON.stringify({ type: "pullTracksResponse", data: pullResponse }));
                        } catch (error) {
                            console.error("[Server] ❌ Error parsing pull response:", error);
                            ws.send(JSON.stringify({ type: "error", message: "Failed to parse pull response" }));
                        }
                    });
                });
                req.on('error', (error) => {
                    console.error("[Server] ❌ API Request error:", error);
                    ws.send(JSON.stringify({ type: "error", message: `API Request error: ${error.message}` }));
                });
                req.write(JSON.stringify({ tracks: tracksToPull }));
                req.end();
            }
        } catch (error) {
            console.error("[Server] ❌ Error handling message:", error);
        }
    });
});
//*******************************************************************************************new changes
wss.on("connection", (ws) => { 
    ws.on("message", (data) => {
        try {
            const message = JSON.parse(data);
    
            if (message.type === "sdpAnswer") {
                // Broadcast to all other peers
                for (let roomId in rooms) {
                    for (const remoteClientId in rooms[roomId]) {
                        if (rooms[roomId][remoteClientId].ws !== ws) { // Don't send back to sender
                            rooms[roomId][remoteClientId].ws.send(JSON.stringify({
                                type: "sdpAnswer",
                                sdp: message.sdp
                            }));
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Error handling message:", error);
        }
    });
    
});
//*********************************************************************************************************end of new changes
console.log('🚀 WebSocket server started on port 3000');
