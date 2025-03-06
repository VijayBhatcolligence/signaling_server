const APP_ID = "9eb4e5f9905845ff1bfaf39ad5fdf622";
const API_TOKEN = "8868573252ae977abc3fbbc421f8ae2c41b2c880ce38e988e367f8f10afeb9d4";
const API_BASE = `https://rtc.live.cloudflare.com/v1/apps/${APP_ID}`;
const SIGNALING_SERVER = "http://localhost:3000"; // Replace with your signaling server URL

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const muteAudioButton = document.getElementById("muteAudio");
const muteVideoButton = document.getElementById("muteVideo");
const chatInput = document.getElementById("chatInput");
const sendMessageButton = document.getElementById("sendMessage");
const chatMessages = document.getElementById("chatMessages");
const emojiPicker = document.querySelector(".emoji-picker");

let localStream;
let localPeerConnection;
let remotePeerConnection;
let localSessionId;
let remoteSessionId;
let socket;

// Initialize
(async () => {
  try {
    // Connect to signaling server
    socket = new WebSocket(SIGNALING_SERVER);
    socket.onmessage = handleSignalingMessage;

    // Get local media stream
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    localVideo.srcObject = localStream;

    // Create local session with Cloudflare
    localSessionId = await createSession();
    console.log("Local Session ID:", localSessionId);

    // Create peer connection
    localPeerConnection = await createPeerConnection();

    // Add local tracks to peer connection
    localStream.getTracks().forEach((track) => {
      localPeerConnection.addTrack(track, localStream);
    });

    // Create offer and send to signaling server
    const offer = await localPeerConnection.createOffer();
    await localPeerConnection.setLocalDescription(offer);
    sendSignal({ type: "offer", sdp: offer.sdp, sessionId: localSessionId });
  } catch (error) {
    console.error("Error initializing:", error);
  }
})();

// Handle signaling messages from the server
function handleSignalingMessage(event) {
  const message = JSON.parse(event.data);

  switch (message.type) {
    case "offer":
      handleOffer(message);
      break;
    case "answer":
      handleAnswer(message);
      break;
    case "ice-candidate":
      handleIceCandidate(message);
      break;
    default:
      console.warn("Unknown message type:", message.type);
  }
}

// Handle incoming offer
async function handleOffer(message) {
  const { sdp, from } = message;

  // Create remote peer connection
  remotePeerConnection = await createPeerConnection();

  // Set remote description
  await remotePeerConnection.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp }));

  // Create answer
  const answer = await remotePeerConnection.createAnswer();
  await remotePeerConnection.setLocalDescription(answer);

  // Send answer to signaling server
  sendSignal({ type: "answer", sdp: answer.sdp, target: from });
}

// Handle incoming answer
async function handleAnswer(message) {
  const { sdp } = message;

  // Set remote description
  await localPeerConnection.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp }));
}

// Handle incoming ICE candidate
async function handleIceCandidate(message) {
  const { candidate } = message;

  // Add ICE candidate to peer connection
  await localPeerConnection.addIceCandidate(new RTCIceCandidate(candidate));
}

// Send signaling data to the server
function sendSignal(data) {
  socket.send(JSON.stringify(data));
}

// Create a new session with Cloudflare
async function createSession() {
  const response = await fetch(`${API_BASE}/sessions/new`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
    },
  });
  const data = await response.json();
  return data.sessionId;
}

// Create a peer connection
async function createPeerConnection() {
  const peerConnection = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
  });

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      sendSignal({ type: "ice-candidate", candidate: event.candidate });
    }
  };

  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  return peerConnection;
}

// Mute/unmute audio
muteAudioButton.addEventListener("click", () => {
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack.enabled) {
    audioTrack.enabled = false;
    muteAudioButton.textContent = "Unmute Audio";
  } else {
    audioTrack.enabled = true;
    muteAudioButton.textContent = "Mute Audio";
  }
});

// Mute/unmute video
muteVideoButton.addEventListener("click", () => {
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack.enabled) {
    videoTrack.enabled = false;
    muteVideoButton.textContent = "Unmute Video";
  } else {
    videoTrack.enabled = true;
    muteVideoButton.textContent = "Mute Video";
  }
});

// Send chat message
sendMessageButton.addEventListener("click", () => {
  const message = chatInput.value;
  if (message) {
    appendMessage("You", message);
    chatInput.value = "";
  }
});

// Add emoji to chat input
emojiPicker.addEventListener("click", (e) => {
  if (e.target.tagName === "SPAN") {
    chatInput.value += e.target.textContent;
  }
});

// Append message to chat
function appendMessage(sender, message) {
  const messageElement = document.createElement("div");
  messageElement.textContent = `${sender}: ${message}`;
  chatMessages.appendChild(messageElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}