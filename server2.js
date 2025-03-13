const https = require('https');
const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 3000 });

const APP_ID = "9eb4e5f9905845ff1bfaf39ad5fdf622"; // Replace with your Cloudflare App ID
const APP_TOKEN = "8868573252ae977abc3fbbc421f8ae2c41b2c880ce38e988e367f8f10afeb9d4"; // Replace with your Cloudflare App Token
const API_BASE = `https://rtc.live.cloudflare.com/v1/apps/${APP_ID}`;

const sessions = {}; // Store session information (including tracks)

// Function to create a new Cloudflare session
function createCloudflareSession() {
    return new Promise((resolve, reject) => {
        const options = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${APP_TOKEN}`,
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(`${API_BASE}/sessions/new`, options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                console.log("📩 Raw API Response:", data);

                try {
                    const parsedData = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsedData.sessionId);
                    } else {
                        reject(new Error(`API request failed with status ${res.statusCode}: ${data}`));
                    }
                } catch (parseError) {
                    console.error("❌ JSON Parsing Error:", parseError.message);
                    reject(new Error(`Error parsing JSON response: ${data}`));
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

// Function to create a Cloudflare track
function createCloudflareTrack(sessionId, kind) {
    return new Promise((resolve, reject) => {
        const trackData = JSON.stringify({ kind });

        const options = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${APP_TOKEN}`,
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(`${API_BASE}/sessions/${sessionId}/tracks`, options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsedData);
                    } else {
                        reject(new Error(`API request failed with status ${res.statusCode}: ${data}`));
                    }
                } catch (parseError) {
                    console.error("❌ JSON Parsing Error:", parseError.message);
                    reject(new Error(`Error parsing JSON response: ${data}`));
                }
            });
        });

        req.on('error', (error) => {
            console.error("⚠️ Request Error:", error);
            reject(error);
        });

        req.write(trackData);
        req.end();
    });
}

// Handle WebSocket connections
wss.on('connection', async ws => {
    let sessionId;
    try {
        sessionId = await createCloudflareSession();
        sessions[sessionId] = { audioTrackId: null, videoTrackId: null, ws };
        console.log(`✅ Session ${sessionId} created.`);
        ws.send(JSON.stringify({ type: 'sessionCreated', sessionId }));
    } catch (error) {
        console.error('❌ Error creating session:', error);
        ws.send(JSON.stringify({ type: 'error', message: error.message }));
        ws.close();
        return;
    }

    ws.on('message', async message => {
        try {
            const parsedMessage = JSON.parse(message);

            if (parsedMessage.type === 'createTrack') {
                const { kind } = parsedMessage;

                if (kind !== 'audio' && kind !== 'video') {
                    ws.send(JSON.stringify({ type: 'error', message: 'Invalid track kind. Must be "audio" or "video".' }));
                    return;
                }

                try {
                    const trackDetails = await createCloudflareTrack(sessionId, kind);
                    const trackId = trackDetails.id;

                    if (kind === 'audio') {
                        sessions[sessionId].audioTrackId = trackId;
                    } else {
                        sessions[sessionId].videoTrackId = trackId;
                    }

                    console.log(`🎤🎥 Cloudflare track created: ${trackId} (${kind})`);
                    ws.send(JSON.stringify({ type: 'trackCreated', trackId, kind }));
                } catch (error) {
                    console.error('❌ Error creating track:', error);
                    ws.send(JSON.stringify({ type: 'error', message: error.message }));
                }
            }
        } catch (error) {
            console.error("❌ Error processing message:", error);
            ws.send(JSON.stringify({ type: 'error', message: 'Internal server error.' }));
        }
    });

    ws.on('close', () => {
        console.log(`🔴 Client disconnected. Session ID: ${sessionId}`);
        delete sessions[sessionId];
    });
});

console.log('🚀 WebSocket server started on port 3000');
