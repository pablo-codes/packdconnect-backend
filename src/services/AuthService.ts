import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { UserRepository } from '../repositories/UserRepository.js';

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;
const JWT_ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

export class AuthService {
  static generateTokens(user: { id: string; email: string; username: string }) {
    const accessToken = jwt.sign(
      { userId: user.id, email: user.email, username: user.username, jti: crypto.randomUUID() },
      JWT_ACCESS_SECRET,
      { expiresIn: JWT_ACCESS_EXPIRY as any }
    );

    const refreshToken = jwt.sign(
      { userId: user.id, email: user.email, username: user.username, jti: crypto.randomUUID() },
      JWT_REFRESH_SECRET,
      { expiresIn: JWT_REFRESH_EXPIRY as any }
    );

    return { accessToken, refreshToken };
  }

  static async register(username: string, email: string, passwordHash: string) {
    const existingUsername = await UserRepository.findByUsername(username);
    if (existingUsername) {
      throw new Error('Username is already taken');
    }

    const existingUser = await UserRepository.findByEmail(email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(passwordHash, salt); // Note: renamed password to passwordHash to clarify the input is a raw password in controller, wait, let me use raw string here.
    const user = await UserRepository.create(username, email, hash);
    const tokens = this.generateTokens(user);

    return { user, tokens };
  }

  static async login(email: string, passwordRaw: string) {
    const user = await UserRepository.findByEmail(email);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(passwordRaw, user.password_hash);
    if (!isMatch) {
      throw new Error('Invalid email or password');
    }

    const tokens = this.generateTokens({
      id: user.id,
      email: user.email,
      username: user.username
    });

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        created_at: user.created_at
      },
      tokens
    };
  }

  static async refresh(refreshToken: string) {
    let decoded: any;
    try {
      decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
    } catch (err) {
      throw new Error('Invalid or expired refresh token');
    }

    const user = await UserRepository.findById(decoded.userId);
    if (!user) {
      throw new Error('User associated with token not found');
    }

    const tokens = this.generateTokens({
      id: user.id,
      email: user.email,
      username: user.username
    });

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      },
      tokens
    };
  }
}
