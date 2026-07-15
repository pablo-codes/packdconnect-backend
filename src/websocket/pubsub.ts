import { redisClient, pubSubClient } from '../config/redis.js';

export async function publishToRoom(roomId: string, payload: any): Promise<void> {
  const channel = `room:${roomId}`;
  await redisClient.publish(channel, JSON.stringify(payload));
  console.log(`[PubSub] Published room event to ${channel}`);
}

export async function publishToUser(userId: string, payload: any): Promise<void> {
  const channel = `user_signals:${userId}`;
  await redisClient.publish(channel, JSON.stringify(payload));
  console.log(`[PubSub] Published user signal to ${channel}`);
}

export function subscribeToEvents(
  onRoomEvent: (roomId: string, event: any) => void,
  onUserEvent: (userId: string, event: any) => void
) {
  pubSubClient.psubscribe('room:*', 'user_signals:*', (err: Error | null | undefined, count?: unknown) => {
    if (err) {
      console.error('[PubSub] Subscription failed:', err);
    } else {
      console.log(`[PubSub] Subscribed successfully. Subscriptions count: ${count}`);
    }
  });

  pubSubClient.on('pmessage', (pattern: string, channel: string, message: string) => {
    try {
      const parsed = JSON.parse(message);
      if (channel.startsWith('room:')) {
        const roomId = channel.split(':')[1];
        onRoomEvent(roomId, parsed);
      } else if (channel.startsWith('user_signals:')) {
        const userId = channel.split(':')[1];
        onUserEvent(userId, parsed);
      }
    } catch (error) {
      console.error(`[PubSub] Error parsing message on channel ${channel}:`, error);
    }
  });
}
