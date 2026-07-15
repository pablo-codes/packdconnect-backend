import { redisClient } from '../config/redis.js';

export async function setUserOnline(userId: string, serverInstanceId: string): Promise<void> {
  try {
    const key = `presence:${userId}`;
    await redisClient.set(key, serverInstanceId, 'EX', 90);
    console.log(`[Presence] User ${userId} marked online on instance ${serverInstanceId}`);
  } catch (error) {
    console.error(`[Presence] Error in setUserOnline for user ${userId}:`, error);
  }
}

export async function setUserOffline(userId: string): Promise<void> {
  try {
    const key = `presence:${userId}`;
    await redisClient.del(key);
    console.log(`[Presence] User ${userId} marked offline`);
  } catch (error) {
    console.error(`[Presence] Error in setUserOffline for user ${userId}:`, error);
  }
}

export async function getUserServer(userId: string): Promise<string | null> {
  try {
    const key = `presence:${userId}`;
    return await redisClient.get(key);
  } catch (error) {
    console.error(`[Presence] Error in getUserServer for user ${userId}:`, error);
    return null;
  }
}

export async function isUserOnline(userId: string): Promise<boolean> {
  try {
    const server = await getUserServer(userId);
    return server !== null;
  } catch (error) {
    console.error(`[Presence] Error in isUserOnline for user ${userId}:`, error);
    return false;
  }
}

export async function getUsersOnlineStatus(userIds: string[]): Promise<Record<string, boolean>> {
  if (userIds.length === 0) return {};
  try {
    const keys = userIds.map(id => `presence:${id}`);
    const results = await redisClient.mget(keys);
    const statusMap: Record<string, boolean> = {};
    userIds.forEach((id, index) => {
      statusMap[id] = results[index] !== null;
    });
    return statusMap;
  } catch (error) {
    console.error('[Presence] Error in getUsersOnlineStatus:', error);
    const statusMap: Record<string, boolean> = {};
    userIds.forEach(id => {
      statusMap[id] = false;
    });
    return statusMap;
  }
}
