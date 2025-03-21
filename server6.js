ws.on("message", (data) => {
    try {
        const message = JSON.parse(data);

        if (message.type === "sdpAnswer") {
            const { roomId, sdp } = message;

            // Ensure the room exists
            if (!rooms[roomId]) {
                rooms[roomId] = {};
            }

            // Store the new SDP answer for future clients
            rooms[roomId][ws] = { ws, sdp };

            // Broadcast SDP answer to all other clients in the room
            for (const remoteClient in rooms[roomId]) {
                if (rooms[roomId][remoteClient].ws !== ws) {
                    rooms[roomId][remoteClient].ws.send(JSON.stringify({
                        type: "sdpAnswer",
                        sdp: sdp
                    }));
                }
            }

            // Send back all stored SDP answers to the sender so it gets all previous peers' offers
            for (const remoteClient in rooms[roomId]) {
                if (rooms[roomId][remoteClient].ws !== ws && rooms[roomId][remoteClient].sdp) {
                    ws.send(JSON.stringify({
                        type: "sdpAnswer",
                        sdp: rooms[roomId][remoteClient].sdp
                    }));
                }
            }
        }
    } catch (error) {
        console.error("Error handling message:", error);
    }
});
