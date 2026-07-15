import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { ChatService } from '../services/ChatService.js';

export async function getConversations(req: AuthenticatedRequest, res: Response) {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = parseInt(req.query.offset as string) || 0;

  try {
    const conversations = await ChatService.getConversations(userId, limit, offset);
    return res.json(conversations);
  } catch (error) {
    console.error('[Chat Controller] getConversations error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getMessages(req: AuthenticatedRequest, res: Response) {
  const userId = req.user?.id;
  const roomId = req.params.id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(roomId)) {
    return res.status(400).json({ error: 'Invalid room ID format' });
  }

  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  
  let before: Date;
  if (req.query.before) {
    const beforeStr = req.query.before as string;
    const parsedDate = Date.parse(beforeStr);
    if (isNaN(parsedDate)) {
      return res.status(400).json({ error: 'Invalid before date format' });
    }
    before = new Date(parsedDate);
  } else {
    before = new Date();
  }

  try {
    const messages = await ChatService.getMessages(userId, roomId, before, limit);
    return res.json(messages);
  } catch (error: any) {
    console.error('[Chat Controller] getMessages error:', error);
    if (error.message === 'You are not a member of this room') {
      return res.status(403).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createRoom(req: AuthenticatedRequest, res: Response) {
  const userId = req.user?.id;
  const { name, isGroup, participantIds } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (isGroup === undefined || !Array.isArray(participantIds)) {
    return res.status(400).json({ error: 'isGroup and participantIds (array) are required' });
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!participantIds.every(id => typeof id === 'string' && uuidRegex.test(id))) {
    return res.status(400).json({ error: 'participantIds must contain only valid UUIDs' });
  }

  try {
    const result = await ChatService.createRoom(userId, isGroup, name, participantIds);
    return res.status(result.message === 'Room created successfully' ? 201 : 200).json(result);
  } catch (error: any) {
    console.error('[Chat Controller] createRoom error:', error);
    if (error.message && error.message.includes('does not exist')) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}
