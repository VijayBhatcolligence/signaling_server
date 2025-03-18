// SERVER CODE
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
                    res.statusCode < 300 ? resolve(parsedData) : reject(new Error(parsedData.errorDescription));
                } catch (error) { reject(error); }
            });
        });
        req.on('error', reject);
        req.write(JSON.stringify(trackData));
        req.end();
    });
}

// async function setupWebRTC(sessionId, trackData, localPeerConnection) {
//     try {
//         // Step 1: Add track to Cloudflare session
//         console.log("Adding track to Cloudflare session...");
//         const pushTracksResponse = await addTrackToCloudflareSession(sessionId, trackData);
//         console.log("Track added successfully:", pushTracksResponse);

//         // Step 2: Set up ICE connection state handler
//         console.log("Setting up ICE connection state handler...");
//         const connected = new Promise((resolve, reject) => {
//             // Timeout after 5s
//             const timeout = setTimeout(() => {
//                 reject(new Error("ICE connection timeout"));
//             }, 5000);

//             const iceConnectionStateChangeHandler = () => {
//                 console.log("ICE connection state changed:", localPeerConnection.iceConnectionState);
//                 if (localPeerConnection.iceConnectionState === "connected") {
//                     localPeerConnection.removeEventListener("iceconnectionstatechange", iceConnectionStateChangeHandler);
//                     clearTimeout(timeout);
//                     console.log("ICE connection state is connected.");
//                     resolve();
//                 }
//             };

//             localPeerConnection.addEventListener("iceconnectionstatechange", iceConnectionStateChangeHandler);
//         });

//         console.log("ICE connection state handler setup.");

//         // Step 3: Set Remote Description
//         console.log("Setting remote description...");
//         await localPeerConnection.setRemoteDescription(new RTCSessionDescription(pushTracksResponse.sessionDescription));
//         console.log("Set remote description.");

//         // Step 4: Wait for ICE connection to be connected
//         console.log("Waiting for ICE connection to be connected...");
//         await connected;
//         console.log("ICE connection is connected.");

//     } catch (error) {
//         console.error("Error in setupWebRTC:", error);
//     }
// }


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
            console.log("[Server] Received message:", message);

            if (message.type === "pullTracks") {
                const { sessionId, body } = message;
            
                console.log("[Server] Pulling tracks for session:", sessionId);
                console.log("[Server] Received track request:", body);
            
                // Dynamically extract tracks
                const tracksToPull = body.tracks.map(track => ({
                    location: "remote",
                    trackName: track.trackName,
                    sessionId: track.sessionId || sessionId
                }));
            const bodyy={method: "POST",
                headers: {
                    'Authorization': `Bearer ${APP_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ tracks: tracksToPull })}

                const options = {
                    method: "POST",
                    headers: {
                        'Authorization': `Bearer ${APP_TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ tracks: tracksToPull })
                };
            
                console.log("[Server] Sending API Request with tracks:", tracksToPull);
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
            
                // Write the data to the request body
                const requestBody = JSON.stringify({ tracks: tracksToPull });
                req.write(requestBody);
                req.end();
            } // End the request
            
        } catch (error) {
            console.error("[Server] ❌ Error handling message:", error);
        }
    });
});



console.log('🚀 WebSocket server started on port 3000');
