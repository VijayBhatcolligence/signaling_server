
import { 
  WebSocketGateway, 
  WebSocketServer, 
  SubscribeMessage, 
  OnGatewayConnection, 
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

interface RoomParticipant {
  socketId: string;
  username: string;
}

interface Room {
  participants: Map<string, RoomParticipant>;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
})
export class Signaling implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private logger = new Logger('SocketGateway');
  private rooms: Map<string, Room> = new Map();

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    // Find all rooms the client was in and notify others
    this.rooms.forEach((room, roomId) => {
      if (room.participants.has(client.id)) {
        // Remove the participant from the room
        const participant = room.participants.get(client.id);
        room.participants.delete(client.id);
        
        // Notify others in the room if participant exists
        if (participant) {
          client.to(roomId).emit('user-disconnected', {
            socketId: client.id,
            username: participant.username,
          });
        }
        
        // If room is empty, delete it
        if (room.participants.size === 0) {
          this.rooms.delete(roomId);
          this.logger.log(`Room ${roomId} deleted (empty)`);
        }
      }
    });
  }

  @SubscribeMessage('join-room')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; username: string },
  ) {
    const { roomId, username } = data;
    this.logger.log(`User ${username} (${client.id}) joining room ${roomId}`);

    // Join the Socket.IO room
    client.join(roomId);

    // Create room if it doesn't exist
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        participants: new Map(),
      });
    }

    const room = this.rooms.get(roomId)!;
    const newParticipant = { socketId: client.id, username };
    
    // Store participant info
    room.participants.set(client.id, newParticipant);

    // Get the list of existing participants to send to the new user
    const existingParticipants = [...room.participants.values()]
      .filter(p => p.socketId !== client.id);

    // Inform the new user about existing participants
    client.emit('room-joined', {
      roomId,
      participants: existingParticipants,
    });

    // Inform existing participants about the new user
    client.to(roomId).emit('new-user-joined', newParticipant);
  }

  @SubscribeMessage('leave-room')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const { roomId } = data;
    this.logger.log(`User ${client.id} leaving room ${roomId}`);

    // Get the room and participant
    const room = this.rooms.get(roomId);
    if (!room) return;

    const participant = room.participants.get(client.id);
    if (!participant) return;

    // Remove participant from room
    room.participants.delete(client.id);
    
    // Leave the Socket.IO room
    client.leave(roomId);

    // Notify others about user leaving
    client.to(roomId).emit('user-disconnected', {
      socketId: client.id,
      username: participant.username,
    });

    // Clean up empty rooms
    if (room.participants.size === 0) {
      this.rooms.delete(roomId);
      this.logger.log(`Room ${roomId} deleted (empty)`);
    }
  }

  @SubscribeMessage('offer')
  handleOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { target: string; offer: any },
  ) {
    this.logger.debug(`Forwarding offer from ${client.id} to ${data.target}`);
    
    // Forward the offer to the intended recipient
    this.server.to(data.target).emit('offer', {
      offer: data.offer,
      from: client.id,
    });
  }

  @SubscribeMessage('answer')
  handleAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { target: string; answer: any },
  ) {
    this.logger.debug(`Forwarding answer from ${client.id} to ${data.target}`);
    
    // Forward the answer to the intended recipient
    this.server.to(data.target).emit('answer', {
      answer: data.answer,
      from: client.id,
    });
  }

  @SubscribeMessage('ice-candidate')
  handleIceCandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { target: string; candidate: any },
  ) {
    this.logger.debug(`Forwarding ICE candidate from ${client.id} to ${data.target}`);
    
    // Forward the ICE candidate to the intended recipient
    this.server.to(data.target).emit('ice-candidate', {
      candidate: data.candidate,
      from: client.id,
    });
  }
}
