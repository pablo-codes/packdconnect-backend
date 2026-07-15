import { ChatRepository } from '../repositories/ChatRepository.js';
import { getUsersOnlineStatus } from './presence.js';

export class ChatService {
  static async getConversations(userId: string, limit: number, offset: number) {
    const conversationsRaw = await ChatRepository.getConversations(userId, limit, offset);

    const participantIdsSet = new Set<string>();
    for (const row of conversationsRaw) {
      if (row.participants) {
        for (const p of row.participants) {
          participantIdsSet.add(p.id);
        }
      }
    }

    const onlineStatusMap = await getUsersOnlineStatus(Array.from(participantIdsSet));

    const conversations = [];
    for (const row of conversationsRaw) {
      if (row.latest_message && !row.latest_message.id) {
        row.latest_message = null;
      }
      if (row.participants) {
        for (const p of row.participants) {
          const online = onlineStatusMap[p.id] || false;
          p.presence = online ? 'online' : 'offline';
        }
      }
      row.unreadCount = row.unread_count || 0;
      conversations.push(row);
    }
    return conversations;
  }

  static async getMessages(userId: string, roomId: string, before: Date, limit: number) {
    const isMember = await ChatRepository.isMember(roomId, userId);
    if (!isMember) {
      throw new Error('You are not a member of this room');
    }

    const messages = await ChatRepository.getMessages(roomId, before, limit);
    return messages.reverse();
  }

  static async createRoom(userId: string, isGroup: boolean, name: string | null, participantIds: string[]) {
    const allParticipants = Array.from(new Set([userId, ...participantIds]));

    if (!isGroup && allParticipants.length === 2) {
      const existingRoom = await ChatRepository.getExistingDMRoom(allParticipants[0], allParticipants[1]);
      if (existingRoom) {
        return { room: existingRoom, message: 'Existing DM room returned' };
      }
    }

    const room = await ChatRepository.createRoomWithMembers(isGroup, name, allParticipants);
    return { room, message: 'Room created successfully' };
  }
}
