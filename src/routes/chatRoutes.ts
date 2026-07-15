import { Router } from 'express';
import { getConversations, getMessages, createRoom } from '../controllers/chat.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/conversations', getConversations);
router.get('/conversations/:id/messages', getMessages);
router.post('/rooms', createRoom);

export default router;
