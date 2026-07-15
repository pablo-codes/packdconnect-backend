import { ContactRepository } from '../repositories/ContactRepository.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { getUsersOnlineStatus } from './presence.js';

export class ContactService {
  static async getContacts(userId: string, search: string, paginate: boolean, page: number, limit: number, offset: number) {
    const contactsRaw = await ContactRepository.getContacts(userId, search, paginate, limit, offset);

    const contactIds = contactsRaw.map(row => row.id);
    const onlineStatusMap = await getUsersOnlineStatus(contactIds);

    const contactsWithPresence = [];
    const total = contactsRaw.length > 0 ? parseInt(contactsRaw[0].total_count) : 0;

    for (const row of contactsRaw) {
      const online = onlineStatusMap[row.id] || false;
      contactsWithPresence.push({
        id: row.id,
        username: row.username,
        name: row.name,
        email: row.email,
        added_at: row.added_at,
        presence: online ? 'online' : 'offline'
      });
    }

    return {
      contacts: contactsWithPresence,
      pagination: {
        total,
        page: paginate ? page : 1,
        limit: paginate ? limit : total,
        pages: paginate ? Math.ceil(total / limit) : 1
      }
    };
  }

  static async addContact(userId: string, targetEmail: string) {
    const targetUser = await UserRepository.findByEmail(targetEmail);
    if (!targetUser) {
      throw new Error('User not found with this email address');
    }

    if (targetUser.id === userId) {
      throw new Error('You cannot add yourself as a contact');
    }

    const exists = await ContactRepository.contactExists(userId, targetUser.id);
    if (exists) {
      throw new Error('This user is already in your contacts list');
    }

    await ContactRepository.addContact(userId, targetUser.id);

    return {
      message: 'Contact added successfully',
      contact: {
        id: targetUser.id,
        name: targetUser.username,
        email: targetUser.email
      }
    };
  }
}
