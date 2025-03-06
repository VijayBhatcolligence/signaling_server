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

wss.on('connection', ws => {
    let clientId;
    let sessionId;

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
            }
        }
       //other request like sdp offer etc.

    });

    ws.on('close', () => {
        if (clientId) {
            delete activeSessions[clientId];
        }
    });
});

console.log('WebSocket server started on port 3000');