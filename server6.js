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

wss.on('connection', ws => {
    let clientId, roomId;
    let sendSessionId, receiveSessionId;

    ws.on('message', async message => {
        const parsedMessage = JSON.parse(message);
        if (parsedMessage.type === 'joinCall') {
            clientId = parsedMessage.clientId;
            roomId = parsedMessage.roomId || "default-room";

            if (!rooms[roomId]) rooms[roomId] = {};

            try {
                // Create both sending and receiving sessions
                sendSessionId = await createCloudflareSession();
                receiveSessionId = await createCloudflareSession();
                
                const trackData = parsedMessage.trackData;
                rooms[roomId][clientId] = { ws, sendSessionId, receiveSessionId, trackData };

                const addTrackResponse = await addTrackToCloudflareSession(sendSessionId, trackData);
                ws.send(JSON.stringify({ type: 'trackAdded', response: addTrackResponse, sendSessionId, receiveSessionId }));

                // Notify existing clients & trigger auto pulling
                for (const remoteClientId in rooms[roomId]) {
                    if (remoteClientId !== clientId) {
                        const remoteClient = rooms[roomId][remoteClientId];
                        remoteClient.ws.send(JSON.stringify({
                            type: 'remoteClientConnected', clientId, sendSessionId, trackData
                        }));

                        ws.send(JSON.stringify({
                            type: 'remoteClientConnected',
                            clientId: remoteClientId,
                            sendSessionId: remoteClient.sendSessionId,
                            trackData: remoteClient.trackData
                        }));

                        // Auto-pull remote tracks into the new client's receive session
                        ws.send(JSON.stringify({
                            type: 'pullTracks',
                            sessionId: receiveSessionId,
                            body: { tracks: [{ trackName: remoteClient.trackData.trackName, sessionId: remoteClient.sendSessionId }] }
                        }));

                        // Auto-pull new client's tracks into existing clients' receive sessions
                        remoteClient.ws.send(JSON.stringify({
                            type: 'pullTracks',
                            sessionId: remoteClient.receiveSessionId,
                            body: { tracks: [{ trackName: trackData.trackName, sessionId: sendSessionId }] }
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

console.log('🚀 WebSocket server started on port 3000');
