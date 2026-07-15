import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET!;

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    username: string;
  };
}

function getAccessTokenFromCookie(req: Request): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';').map(c => c.trim());
  for (const cookie of cookies) {
    const eqIndex = cookie.indexOf('=');
    if (eqIndex === -1) continue;
    const key = cookie.substring(0, eqIndex);
    const val = cookie.substring(eqIndex + 1);
    if (key === 'accessToken') return decodeURIComponent(val);
  }
  return null;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = getAccessTokenFromCookie(req);
  if (!token) {
    return res.status(401).json({ error: 'Access token cookie missing' });
  }

  try {
    const decoded = jwt.verify(token, JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as { userId: string; email: string; username: string };
    (req as AuthenticatedRequest).user = {
      id: decoded.userId,
      email: decoded.email,
      username: decoded.username,
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired access token' });
  }
}

export function verifyWsToken(token: string) {
  try {
    const decoded = jwt.verify(token, JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as { userId: string; email: string; username: string };
    return {
      id: decoded.userId,
      email: decoded.email,
      username: decoded.username,
    };
  } catch (error) {
    throw new Error('Invalid or expired WebSocket token');
  }
}
