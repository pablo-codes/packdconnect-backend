import { Request, Response } from 'express';
import { AuthService } from '../services/AuthService.js';

const isProd = process.env.NODE_ENV === 'production';
const getCookieOptions = (maxAge?: number) => ({
  httpOnly: true,
  secure: isProd,
  sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
  domain: process.env.COOKIE_DOMAIN || undefined,
  path: '/',
  ...(maxAge !== undefined ? { maxAge } : {}),
});

function getRefreshTokenFromCookie(req: Request): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';').map(c => c.trim());
  for (const cookie of cookies) {
    const eqIndex = cookie.indexOf('=');
    if (eqIndex === -1) continue;
    const key = cookie.substring(0, eqIndex);
    const val = cookie.substring(eqIndex + 1);
    if (key === 'refreshToken') return decodeURIComponent(val);
  }
  return null;
}

export async function register(req: Request, res: Response) {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long' });
  }

  if (typeof username !== 'string' || username.length < 3 || username.length > 30) {
    return res.status(400).json({ error: 'Username must be between 3 and 30 characters long' });
  }

  try {
    const { user, tokens } = await AuthService.register(username, email, password);

    res.cookie('refreshToken', tokens.refreshToken, getCookieOptions(7 * 24 * 60 * 60 * 1000));
    res.cookie('accessToken', tokens.accessToken, getCookieOptions(15 * 60 * 1000));

    return res.status(201).json({ user });
  } catch (error: any) {
    console.error('[Auth Controller] Register error:', error);
    if (error.message === 'Username is already taken' || error.message === 'User with this email already exists') {
      return res.status(409).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const { user, tokens } = await AuthService.login(email, password);

    res.cookie('refreshToken', tokens.refreshToken, getCookieOptions(7 * 24 * 60 * 60 * 1000));
    res.cookie('accessToken', tokens.accessToken, getCookieOptions(15 * 60 * 1000));

    return res.json({ user });
  } catch (error: any) {
    console.error('[Auth Controller] Login error:', error);
    if (error.message === 'Invalid email or password') {
      return res.status(401).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function refresh(req: Request, res: Response) {
  const refreshToken = getRefreshTokenFromCookie(req);

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is missing from cookies' });
  }

  try {
    const { user, tokens } = await AuthService.refresh(refreshToken);

    res.cookie('refreshToken', tokens.refreshToken, getCookieOptions(7 * 24 * 60 * 60 * 1000));
    res.cookie('accessToken', tokens.accessToken, getCookieOptions(15 * 60 * 1000));

    return res.json({ user });
  } catch (error: any) {
    console.error('[Auth Controller] Refresh error:', error);
    if (error.message === 'Invalid or expired refresh token' || error.message === 'User associated with token not found') {
      return res.status(401).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function logout(req: Request, res: Response) {
  try {
    res.clearCookie('refreshToken', getCookieOptions());
    res.clearCookie('accessToken', getCookieOptions());
    return res.json({ message: 'Logged out successfully' });
  } catch (error: any) {
    console.error('[Auth Controller] Logout error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
