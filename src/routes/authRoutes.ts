import { Router } from 'express';
import { register, login, refresh, logout } from '../controllers/auth.js';
import { rateLimit } from 'express-rate-limit';

const router = Router();

// Auth rate limiting (effectively disabled for dev)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100000, // Disabled
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again later.' }
});

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/refresh', authLimiter, refresh);
router.post('/logout', authLimiter, logout);

export default router;
