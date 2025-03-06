const https = require('https');
const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 3000 });

const APP_ID = "9eb4e5f9905845ff1bfaf39ad5fdf622"; // Replace with your Cloudflare App ID
const APP_TOKEN = "8868573252ae977abc3fbbc421f8ae2c41b2c880ce38e988e367f8f10afeb9d4"; // Replace with your Cloudflare App Token
const API_BASE = `https://rtc.live.cloudflare.com/v1/apps/${APP_ID}`;

const sessions = {};
const activeSessions = {};

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
        console.log("📩 Raw API Response (addTrack):", data);  // Log raw response

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
          reject(new Error(`Error parsing JSON response: ${data}`));
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

  ws.on('message', async message => {
    console.log(`Received message: ${message}`);
    const parsedMessage = JSON.parse(message);

    if (parsedMessage.type === 'joinCall') {
      clientId = parsedMessage.clientId;
      try {
        sessionId = await createCloudflareSession();
        activeSessions[clientId] = { sessionId, ws };
        ws.send(JSON.stringify({ type: 'sessionCreated', sessionId }));
        // Immediately send addTrack Message;
          const trackData = parsedMessage.trackData;
          if (!sessionId) {
            ws.send(JSON.stringify({ type: 'error', message: 'Session ID is not yet initialized.' }));
            return;
          }

          try {
            const addTrackResponse = await addTrackToCloudflareSession(sessionId, trackData);
            ws.send(JSON.stringify({ type: 'trackAdded', response: addTrackResponse }));
          } catch (error) {
            console.error('Error adding track:', error);
            ws.send(JSON.stringify({ type: 'error', message: error.message }));
          }
      } catch (error) {
        console.error('Error creating session:', error);
        ws.send(JSON.stringify({ type: 'error', message: error.message }));
      }
    }
  });

  ws.on('close', () => {
    if (clientId) {
      delete activeSessions[clientId];
    }
  });
});

console.log('🚀 WebSocket server started on port 3000');