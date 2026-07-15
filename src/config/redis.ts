import { Redis } from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

console.log(`[Redis] Connecting to client at ${redisUrl}...`);
export const redisClient = new Redis(redisUrl);

console.log(`[Redis] Connecting to pub/sub client at ${redisUrl}...`);
export const pubSubClient = new Redis(redisUrl);

redisClient.on('connect', () => {
  console.log('[Redis] Client connected successfully.');
});

redisClient.on('error', (err: any) => {
  console.error('[Redis] Client connection error:', err);
});

pubSubClient.on('connect', () => {
  console.log('[Redis] PubSub Client connected successfully.');
});

pubSubClient.on('error', (err: any) => {
  console.error('[Redis] PubSub Client connection error:', err);
});
