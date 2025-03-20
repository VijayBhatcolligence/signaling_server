const https = require("https");
const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 3000 });

const APP_ID = "9eb4e5f9905845ff1bfaf39ad5fdf622";
const APP_TOKEN = "8868573252ae977abc3fbbc421f8ae2c41b2c880ce38e988e367f8f10afeb9d4";
const API_BASE = `https://rtc.live.cloudflare.com/v1/apps/${APP_ID}`;

const rooms = {}; // Store clients by room

function createCloudflareSession() {
    return new Promise((resolve, reject) => {
        const options = {
            method: "POST",
            headers: { Authorization: `Bearer ${APP_TOKEN}` },
        };

        const req = https.request(`${API_BASE}/sessions/new`, options, (res) => {
            let data = "";
            res.on("data", (chunk) => {
                data += chunk;
            });
            res.on("end", () => {
                try {
                    const parsedData = JSON.parse(data);
                    res.statusCode < 300 ? resolve(parsedData.sessionId) : reject(new Error(parsedData.errorDescription));
                } catch (error) {
                    reject(error);
                }
            });
        });
        req.on("error", reject);
        req.end();
    });
}

// ✅ Reusable function to handle ICE state and setting remote description
async function handleRemoteDescription(localPeerConnection, sessionDescription) {
    console.log("Setting up ICE connection state handler...");

    const connected = new Promise((res, rej) => {
        setTimeout(rej, 5000); // Timeout after 5s
        const iceConnectionStateChangeHandler = () => {
            console.log("ICE connection state changed:", localPeerConnection.iceConnectionState);
            if (localPeerConnection.iceConnectionState === "connected") {
                localPeerConnection.removeEventListener(
                    "iceconnectionstatechange",
                    iceConnectionStateChangeHandler
                );
                console.log("ICE connection state is connected.");
                res();
            }
        };
        localPeerConnection.addEventListener("iceconnectionstatechange", iceConnectionStateChangeHandler);
    });

    console.log("ICE connection state handler setup.");

    // Set the remote description
    console.log("Setting remote description...");
    await localPeerConnection.setRemoteDescription(new RTCSessionDescription(sessionDescription));
    console.log("Set remote description.");

    // Wait for ICE connection
    console.log("Waiting for ICE connection to be connected...");
    await connected;
    console.log("ICE connection is connected.");
}

function addTrackToCloudflareSession(sessionId, trackData, localPeerConnection) {
    return new Promise((resolve, reject) => {
        const options = {
            method: "POST",
            headers: {
                Authorization: `Bearer ${APP_TOKEN}`,
                "Content-Type": "application/json",
            },
        };

        const req = https.request(`${API_BASE}/sessions/${sessionId}/tracks/new`, options, (res) => {
            let data = "";
            res.on("data", (chunk) => {
                data += chunk;
            });
            res.on("end", async () => {
                try {
                    const parsedData = JSON.parse(data);
                    console.log("[Server] Cloudflare Answer SDP:", parsedData.sessionDescription?.sdp);

                    if (localPeerConnection) {
                        await handleRemoteDescription(localPeerConnection, parsedData.sessionDescription);
                    }

                    res.statusCode < 300 ? resolve(parsedData) : reject(new Error(parsedData.errorDescription));
                } catch (error) {
                    reject(error);
                }
            });
        });
        req.on("error", reject);
        req.write(JSON.stringify(trackData));
        console.log("[Server] Offer sent to Cloudflare");
        req.end();
    });
}

wss.on("connection", (ws) => {
    let clientId, sessionId, roomId, localPeerConnection;

    ws.on("message", async (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            console.log("[Server] Received message:", parsedMessage);

            if (parsedMessage.type === "pullTracks") {
                const { sessionId, body } = parsedMessage;
                console.log("[Server] Pulling tracks for session:", sessionId);
                console.log("[Server] Received track request:", body);

                const tracksToPull = body.tracks.map((track) => ({
                    location: "remote",
                    trackName: track.trackName,
                    sessionId: track.sessionId || sessionId,
                }));

                console.log("[Server] Sending API Request with tracks:", tracksToPull);

                const options = {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${APP_TOKEN}`,
                        "Content-Type": "application/json",
                    },
                };

                const req = https.request(`${API_BASE}/sessions/${sessionId}/tracks/new`, options, (res) => {
                    let responseData = "";
                    res.on("data", (chunk) => {
                        responseData += chunk;
                    });
                    res.on("end", async () => {
                        try {
                            const pullResponse = JSON.parse(responseData);
                            console.log("[Server] ✅ Pull response received:", pullResponse);

                            if (localPeerConnection) {
                                await handleRemoteDescription(localPeerConnection, pullResponse.sessionDescription);
                            }

                            ws.send(JSON.stringify({ type: "pullTracksResponse", data: pullResponse }));
                        } catch (error) {
                            console.error("[Server] ❌ Error parsing pull response:", error);
                            ws.send(JSON.stringify({ type: "error", message: "Failed to parse pull response" }));
                        }
                    });
                });
                req.on("error", (error) => {
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

console.log("🚀 WebSocket server started on port 3000");
