import { WebSocket } from 'ws';
import { ChatRepository } from '../repositories/ChatRepository.js';
import { publishToRoom, publishToUser } from './pubsub.js';
import { setUserOnline } from '../services/presence.js';
import { serverInstanceId } from './server.js';

export async function handleSendMessage(
  userId: string,
  data: { roomId: string; content: string; attachmentUrl?: string },
  ws: WebSocket
) {
  setUserOnline(userId, serverInstanceId).catch(() => {});
  const { roomId, content, attachmentUrl } = data;
  if (!roomId || !content) {
    console.warn('[ChatHandler] send_message validation failed: missing roomId or content');
    ws.send(JSON.stringify({ type: 'error', message: 'Missing roomId or content' }));
    return;
  }

  if (content.length > 5000) {
    ws.send(JSON.stringify({ type: 'error', message: 'Message content exceeds maximum length of 5000 characters' }));
    return;
  }

  if (attachmentUrl) {
    let isValid = false;
    try {
      const url = new URL(attachmentUrl);
      isValid = url.protocol === 'http:' || url.protocol === 'https:';
    } catch (e) {
      isValid = false;
    }
    if (!isValid) {
      ws.send(JSON.stringify({ type: 'error', message: 'attachmentUrl must be a valid HTTP or HTTPS URL' }));
      return;
    }
  }

  try {
    const isMember = await ChatRepository.isMember(roomId, userId);
    if (!isMember) {
      console.warn(`[ChatHandler] User ${userId} is not a member of room ${roomId}`);
      ws.send(JSON.stringify({ type: 'error', message: 'You are not a member of this room' }));
      return;
    }

    const message = await ChatRepository.insertMessage(roomId, userId, content, attachmentUrl || null);

    await publishToRoom(roomId, {
      type: 'message',
      message
    });
  } catch (error) {
    console.error('[ChatHandler] Error in send_message:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to send message' }));
  }
}

export async function handleTyping(userId: string, data: { roomId: string; isTyping: boolean }, ws: WebSocket) {
  setUserOnline(userId, serverInstanceId).catch(() => {});
  const { roomId, isTyping } = data;
  if (!roomId || isTyping === undefined) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing roomId or isTyping' }));
    return;
  }

  try {
    const isMember = await ChatRepository.isMember(roomId, userId);
    if (!isMember) {
      console.warn(`[ChatHandler] User ${userId} is not a member of room ${roomId} for typing`);
      ws.send(JSON.stringify({ type: 'error', message: 'You are not a member of this room' }));
      return;
    }

    await publishToRoom(roomId, {
      type: 'typing',
      roomId,
      userId,
      isTyping
    });
  } catch (error) {
    console.error('[ChatHandler] Error in typing indicator:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to send typing indicator' }));
  }
}

export async function handleMarkRead(userId: string, data: { roomId: string }, ws: WebSocket) {
  setUserOnline(userId, serverInstanceId).catch(() => {});
  const { roomId } = data;
  if (!roomId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing roomId' }));
    return;
  }

  try {
    const isMember = await ChatRepository.isMember(roomId, userId);
    if (!isMember) {
      console.warn(`[ChatHandler] User ${userId} is not a member of room ${roomId} for mark_read`);
      ws.send(JSON.stringify({ type: 'error', message: 'You are not a member of this room' }));
      return;
    }

    const updatedRows = await ChatRepository.markMessagesAsRead(roomId, userId);

    if (updatedRows.length === 0) {
      return; 
    }

    const senderMessagesMap = new Map<string, string[]>();
    for (const row of updatedRows) {
      if (!senderMessagesMap.has(row.sender_id)) {
        senderMessagesMap.set(row.sender_id, []);
      }
      senderMessagesMap.get(row.sender_id)!.push(row.id);
    }

    for (const [senderId, messageIds] of senderMessagesMap.entries()) {
      await publishToUser(senderId, {
        type: 'read_receipt',
        roomId,
        readerId: userId,
        messageIds
      });
    }
  } catch (error) {
    console.error('[ChatHandler] Error in mark_read:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to mark messages as read' }));
  }
}
