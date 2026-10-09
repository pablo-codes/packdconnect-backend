import { Redis } from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const isProd = process.env.NODE_ENV === 'production';

let redisConfig: any;

if (process.env.REDIS_PASSWORD) {
  redisConfig = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  };
} else {
  redisConfig = process.env.REDIS_URL || 'redis://localhost:6379';
}

if (isProd && process.env.REDIS_HOST && process.env.REDIS_ACCESS_KEY) {
  redisConfig = {
    host: process.env.REDIS_HOST,
    port: 6380,
    password: process.env.REDIS_ACCESS_KEY,
    tls: {
      servername: process.env.REDIS_HOST
    }
  };
}

console.log(`[Redis] Connecting to client...`);
export const redisClient = new Redis(redisConfig);

console.log(`[Redis] Connecting to pub/sub client...`);
export const pubSubClient = new Redis(redisConfig);

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
