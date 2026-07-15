import { Router } from 'express';
import { getActivityHistory } from '../controllers/history.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/', getActivityHistory);

export default router;
