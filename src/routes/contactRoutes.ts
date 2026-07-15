import { Router } from 'express';
import { getContacts, addContact } from '../controllers/contacts.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/', getContacts);
router.post('/', addContact);

export default router;
