import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { HistoryService } from '../services/HistoryService.js';

export async function getActivityHistory(req: AuthenticatedRequest, res: Response) {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

  try {
    const historyItems = await HistoryService.getActivityHistory(userId, limit, offset);
    return res.json(historyItems);
  } catch (error) {
    console.error('[History Controller] getActivityHistory error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
