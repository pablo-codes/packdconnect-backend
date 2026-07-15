import { WebSocketServer, WebSocket } from 'ws';
import { Server, IncomingMessage } from 'http';
import { parse } from 'url';
import crypto from 'crypto';
import { verifyWsToken } from '../middleware/auth.js';
import { setUserOnline, setUserOffline } from '../services/presence.js';
import { publishToRoom, publishToUser, subscribeToEvents } from './pubsub.js';
import { handleSendMessage, handleTyping, handleMarkRead } from './chatHandler.js';
import {
  handleCallInitiate,
  handleCallAnswer,
  handleIceCandidate,
  handleCallHangup,
  handleCallReject,
} from './callHandler.js';
import { ChatRepository } from '../repositories/ChatRepository.js';
import { CallRepository } from '../repositories/CallRepository.js';

export const serverInstanceId = crypto.randomUUID();
export const localSessions = new Map<string, Set<WebSocket>>();

export function initWebSocketServer(httpServer: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  // Heartbeat interval (every 30 seconds)
  const interval = setInterval(() => {
    wss.clients.forEach((clientWs: any) => {
      if (clientWs.isAlive === false) {
        console.log(`[WS Heartbeat] Terminating inactive socket connection`);
        return clientWs.terminate();
      }
      clientWs.isAlive = false;
      clientWs.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  // Handle HTTP upgrade manually to perform JWT auth via cookie
  httpServer.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url || '');
    if (pathname !== '/ws') {
      return;
    }

    // Parse accessToken from Cookie header (browser sends cookies automatically on upgrade)
    const cookieHeader = request.headers.cookie || '';
    let token: string | null = null;
    for (const part of cookieHeader.split(';')) {
      const trimmed = part.trim();
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.substring(0, eqIndex);
      const val = trimmed.substring(eqIndex + 1);
      if (key === 'accessToken') {
        token = decodeURIComponent(val);
        break;
      }
    }

    if (!token) {
      console.warn('[WS Upgrade] Rejected: No access token cookie');
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    try {
      const user = verifyWsToken(token);
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, user);
      });
    } catch (err) {
      console.warn('[WS Upgrade] Rejected: Invalid token');
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });

  wss.on('connection', async (ws: WebSocket, request: IncomingMessage, user: { id: string; email: string; username: string }) => {
    const userId = user.id;
    console.log(`[WS] Connection established. User ID: ${userId} (${user.username})`);

    // Setup heartbeat flag
    (ws as any).isAlive = true;
    ws.on('pong', () => {
      (ws as any).isAlive = true;
    });

    // Add to local sessions
    if (!localSessions.has(userId)) {
      localSessions.set(userId, new Set());
    }
    const userSockets = localSessions.get(userId)!;
    if (userSockets.size >= 5) {
      console.warn(`[WS] Connection rejected: Max connections (5) reached for user ${userId}`);
      ws.close(1008, 'Max concurrent connections reached');
      return;
    }
    const isFirstConnection = userSockets.size === 0;
    userSockets.add(ws);

    // Track online in Redis
    await setUserOnline(userId, serverInstanceId);

    // If first connection, broadcast status = online to all rooms they belong to
    if (isFirstConnection) {
      try {
        const roomIds = await ChatRepository.getRoomIdsForUser(userId);
        await Promise.all(roomIds.map(roomId =>
          publishToRoom(roomId, {
            type: 'presence_change',
            userId,
            status: 'online',
          })
        ));
      } catch (err) {
        console.error('[WS] Error broadcasting online presence:', err);
      }
    }

    let messageCount = 0;
    let windowStart = Date.now();

    ws.on('message', async (message) => {
      // Per-connection message rate limiting (max 30 messages/second)
      const now = Date.now();
      if (now - windowStart > 1000) {
        messageCount = 1;
        windowStart = now;
      } else {
        messageCount++;
        if (messageCount > 30) {
          console.warn(`[WS] Rate limit exceeded for user ${userId}. Disconnecting...`);
          ws.close(1008, 'Rate limit exceeded');
          return;
        }
      }

      try {
        const data = JSON.parse(message.toString());
        if (process.env.NODE_ENV === 'development') {
          console.log(`[WS] Received event [${data.type}] from User [${userId}]`);
        }
        
        switch (data.type) {
          case 'send_message':
            await handleSendMessage(userId, data, ws);
            break;
          case 'typing':
            await handleTyping(userId, data, ws);
            break;
          case 'mark_read':
            await handleMarkRead(userId, data, ws);
            break;
          case 'call_initiate':
            await handleCallInitiate(userId, data, ws);
            break;
          case 'call_answer':
            await handleCallAnswer(userId, data, ws);
            break;
          case 'ice_candidate':
            await handleIceCandidate(userId, data, ws);
            break;
          case 'call_hangup':
            await handleCallHangup(userId, data, ws);
            break;
          case 'call_reject':
            await handleCallReject(userId, data, ws);
            break;
          default:
            console.warn(`[WS] Unknown event type: ${data.type}`);
            ws.send(JSON.stringify({ type: 'error', message: `Unknown event type: ${data.type}` }));
        }
      } catch (err: any) {
        console.error(`[WS] Error handling message from user ${userId}:`, err);
        ws.send(JSON.stringify({ type: 'error', message: 'Failed to process message' }));
      }
    });

    ws.on('close', async () => {
      try {
        console.log(`[WS] Connection closed. User ID: ${userId}`);
        userSockets.delete(ws);

        if (userSockets.size === 0) {
          localSessions.delete(userId);
          await setUserOffline(userId);

          // Broadcast status = offline to all rooms they belong to
          try {
            const roomIds = await ChatRepository.getRoomIdsForUser(userId);
            await Promise.all(roomIds.map(roomId =>
              publishToRoom(roomId, {
                type: 'presence_change',
                userId,
                status: 'offline',
              })
            ));
          } catch (err) {
            console.error('[WS] Error broadcasting offline presence:', err);
          }

          // H11: Cleanup active calls on disconnect
          try {
            const activeCalls = await CallRepository.getActiveCallsForUser(userId);

            for (const call of activeCalls) {
              const callId = call.id;
              const roomId = call.room_id;
              const oldStatus = call.status;
              
              const newStatus = oldStatus === 'ringing' ? 'rejected' : 'completed';
              
              await CallRepository.updateCallStatusForce(callId, newStatus);

              const otherMembers = await ChatRepository.getRoomMembers(roomId, userId);

              await Promise.all(otherMembers.map(peerId => {
                if (oldStatus === 'ringing') {
                  return publishToUser(peerId, {
                    type: 'call_rejected',
                    callId,
                    senderId: userId
                  });
                } else {
                  return publishToUser(peerId, {
                    type: 'call_hungup',
                    callId,
                    senderId: userId
                  });
                }
              }));
            }
          } catch (err) {
            console.error('[WS] Error cleaning up active calls on disconnect:', err);
          }
        }
      } catch (err) {
        console.error('[WS] Error in socket close handler:', err);
      }
    });

    ws.on('error', (err) => {
      console.error(`[WS] Error on socket for user ${userId}:`, err);
    });
  });

  // Start Redis Pub/Sub subscription and routing loop
  console.log('[WS] Initializing Redis Pub/Sub subscriptions...');
  subscribeToEvents(
    // On Room event
    async (roomId, event) => {
      try {
        // Query room members to know who to route the message to
        const membersResult = await ChatRepository.getRoomMembers(roomId);
        for (const memberId of membersResult) {
          
          const sockets = localSessions.get(memberId);
          if (sockets) {
            const payloadStr = JSON.stringify(event);
            sockets.forEach((socket) => {
              if (socket.readyState === WebSocket.OPEN) {
                socket.send(payloadStr);
              }
            });
          }
        }
      } catch (err) {
        console.error(`[WS] Pub/Sub room event routing failed for room ${roomId}:`, err);
      }
    },
    // On User event
    (userId, event) => {
      const sockets = localSessions.get(userId);
      if (sockets) {
        const payloadStr = JSON.stringify(event);
        sockets.forEach((socket) => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(payloadStr);
          }
        });
      }
    }
  );

  console.log('[WS] WebSocket Server initialized.');
}
