import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { ContactService } from '../services/ContactService.js';

export async function getContacts(req: AuthenticatedRequest, res: Response) {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const paginate = req.query.paginate !== 'false';
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 10, 1), 100);
    const offset = (page - 1) * limit;

    const result = await ContactService.getContacts(userId, search, paginate, page, limit, offset);
    return res.json(result);
  } catch (error) {
    console.error('[Contacts Controller] getContacts error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function addContact(req: AuthenticatedRequest, res: Response) {
  const userId = req.user?.id;
  const { email } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email address is required' });
  }

  const targetEmail = email.trim().toLowerCase();

  try {
    const result = await ContactService.addContact(userId, targetEmail);
    return res.status(201).json(result);
  } catch (error: any) {
    console.error('[Contacts Controller] addContact error:', error);
    if (error.message === 'User not found with this email address') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'You cannot add yourself as a contact' || error.message === 'This user is already in your contacts list') {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}
