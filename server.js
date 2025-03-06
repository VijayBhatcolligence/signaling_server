const WebSocket = require('ws');
const fetch = require('node-fetch'); // For server-side fetch

const wss = new WebSocket.Server({ port: 3000 });

const APP_ID = "9eb4e5f9905845ff1bfaf39ad5fdf622";
const APP_TOKEN = " 8868573252ae977abc3fbbc421f8ae2c41b2c880ce38e988e367f8f10afeb9d4";
const API_BASE = `https://rtc.live.cloudflare.com/v1/apps/${APP_ID}`;

const activeSessions = {}; // Store session info (sessionId, clients)

async function createCloudflareSession() {
    try {
        const response = await fetch(`${API_BASE}/sessions/new`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${APP_TOKEN}` },
        });
        const data = await response.json();
        return data.sessionId;
      } catch (error) {
        console.error('Error creating Cloudflare session:', error);
        return null; // Or throw the error if you want it to propagate
      
  };
  const data = await response.json();
  return data.sessionId;
}

wss.on('connection', ws => {
  let clientId;
  let sessionId;

  ws.on('message', async message => {
    const parsedMessage = JSON.parse(message);

    if (parsedMessage.type === 'joinCall') {
      clientId = parsedMessage.clientId; // Assign a unique ID
      sessionId = await createCloudflareSession(); // or join existing
      activeSessions[clientId] = { sessionId, ws }; // Store session info

      ws.send(JSON.stringify({ type: 'sessionCreated', sessionId }));
    } else if (parsedMessage.type === 'sdpOffer') {
      //Push Offer to Cloudflare
       const response = await fetch(`${API_BASE}/sessions/${sessionId}/tracks/new`,{
           method:"POST",
           body: JSON.stringify({
               sessionDescription: {sdp: parsedMessage.sdp, type: "offer"},
               // Add Tracks details as needed
           }),
           headers: { Authorization: `Bearer ${APP_TOKEN}`, "Content-Type": "application/json"}
       });
       const data = await response.json();

       ws.send(JSON.stringify({type: 'sdpAnswer', sdp: data.sessionDescription.sdp})); //Send Answer back to client
       console.log(data);
    }
    //... handle ice candidates, pulling tracks for remote peer, etc
  });

  ws.on('close', () => {
    if (clientId) {
      delete activeSessions[clientId];
      // Clean up Cloudflare Calls Session? (depending on your logic)
    }
  });
});

console.log('WebSocket server started on port 3000');