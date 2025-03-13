const ws = new WebSocket("ws://localhost:3000");

ws.onopen = async () => {
    console.log("🔗 WebSocket Connected");

    // Send WebRTC offer once connected
    const payload = await createWebRTCOffer();
    ws.send(JSON.stringify({ type: "webrtcOffer", ...payload }));
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log("📩 Server Response:", data);

    if (data.type === "error") {
        console.error("❌ Server Error:", data.message);
    } else if (data.type === "sessionCreated") {
        console.log(`✅ Session Created: ${data.sessionId}`);
    } else if (data.type === "trackCreated") {
        console.log(`🎥 Track Created: ${data.trackId} (${data.kind})`);
    }
};

ws.onerror = (error) => {
    console.error("❌ WebSocket Error:", error);
};

ws.onclose = () => {
    console.log("🔴 WebSocket Disconnected");
};

// Function to create WebRTC offer
async function createWebRTCOffer() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

        const pc = new RTCPeerConnection();
        const tracksInfo = [];

        stream.getTracks().forEach((track, index) => {
            pc.addTrack(track, stream);
            console.log(`✅ Track added: ${track.kind}`);

            tracksInfo.push({
                location: "local",
                mid: index.toString(),
                trackName: crypto.randomUUID()
            });
        });

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const payload = {
            sessionDescription: {
                sdp: offer.sdp,
                type: offer.type
            },
            tracks: tracksInfo
        };

        console.log("📩 Payload Sent:", JSON.stringify(payload, null, 2));
        return payload;
    } catch (error) {
        console.error("❌ Error creating WebRTC offer:", error);
    }
}
