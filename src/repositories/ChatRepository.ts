import pool, { query } from '../config/db.js';

export class ChatRepository {
  static async getConversations(userId: string, limit: number, offset: number) {
    const sql = `
      SELECT 
        r.id AS id,
        r.name AS name,
        r.is_group AS is_group,
        r.created_at AS created_at,
        (
          SELECT COUNT(*)::int
          FROM messages m
          WHERE m.room_id = r.id AND m.sender_id != $1 AND m.read_at IS NULL
        ) AS unread_count,
        (
          SELECT json_agg(json_build_object('id', u.id, 'username', u.username, 'email', u.email))
          FROM room_members rm
          JOIN users u ON rm.user_id = u.id
          WHERE rm.room_id = r.id AND rm.user_id != $1
        ) AS participants,
        (
          SELECT json_build_object(
            'id', m.id, 
            'content', m.content, 
            'sender_id', m.sender_id, 
            'created_at', m.created_at, 
            'read_at', m.read_at, 
            'attachment_url', m.attachment_url
          )
          FROM messages m
          WHERE m.room_id = r.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) AS latest_message
      FROM room_members rm_self
      JOIN rooms r ON rm_self.room_id = r.id
      WHERE rm_self.user_id = $1
      ORDER BY (
        SELECT COALESCE(MAX(m.created_at), r.created_at)
        FROM messages m
        WHERE m.room_id = r.id
      ) DESC
      LIMIT $2 OFFSET $3;
    `;
    const result = await query(sql, [userId, limit, offset]);
    return result.rows;
  }

  static async isMember(roomId: string, userId: string) {
    const result = await query(
      'SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2',
      [roomId, userId]
    );
    return result.rows.length > 0;
  }

  static async getMessages(roomId: string, before: Date, limit: number) {
    const sql = `
      SELECT id, room_id, sender_id, content, attachment_url, created_at, read_at
      FROM messages
      WHERE room_id = $1 AND created_at < $2
      ORDER BY created_at DESC
      LIMIT $3
    `;
    const result = await query(sql, [roomId, before, limit]);
    return result.rows;
  }

  static async getExistingDMRoom(userId1: string, userId2: string) {
    const dmSql = `
      SELECT rm1.room_id
      FROM room_members rm1
      JOIN room_members rm2 ON rm1.room_id = rm2.room_id
      JOIN rooms r ON rm1.room_id = r.id
      WHERE r.is_group = FALSE
        AND rm1.user_id = $1
        AND rm2.user_id = $2
      LIMIT 1
    `;
    const dmCheck = await query(dmSql, [userId1, userId2]);
    if (dmCheck.rows.length > 0) {
      const roomResult = await query('SELECT * FROM rooms WHERE id = $1', [dmCheck.rows[0].room_id]);
      return roomResult.rows[0];
    }
    return null;
  }

  static async createRoomWithMembers(isGroup: boolean, name: string | null, participantIds: string[]) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const roomResult = await client.query(
        'INSERT INTO rooms (name, is_group) VALUES ($1, $2) RETURNING *',
        [isGroup ? name || 'Group Chat' : null, isGroup]
      );
      const room = roomResult.rows[0];

      for (const pId of participantIds) {
        const userCheck = await client.query('SELECT 1 FROM users WHERE id = $1', [pId]);
        if (userCheck.rows.length === 0) {
          throw new Error(`User with ID ${pId} does not exist`);
        }
        await client.query(
          'INSERT INTO room_members (room_id, user_id) VALUES ($1, $2)',
          [room.id, pId]
        );
      }
      await client.query('COMMIT');
      return room;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async insertMessage(roomId: string, senderId: string, content: string, attachmentUrl: string | null) {
    const result = await query(
      'INSERT INTO messages (room_id, sender_id, content, attachment_url) VALUES ($1, $2, $3, $4) RETURNING *',
      [roomId, senderId, content, attachmentUrl]
    );
    return result.rows[0];
  }

  static async markMessagesAsRead(roomId: string, userId: string) {
    const result = await query(
      'UPDATE messages SET read_at = NOW() WHERE room_id = $1 AND sender_id != $2 AND read_at IS NULL RETURNING id, sender_id',
      [roomId, userId]
    );
    return result.rows;
  }

  static async usersInCommonRoom(userId1: string, userId2: string) {
    const commonRoom = await query(
      `SELECT 1 FROM room_members rm1
       JOIN room_members rm2 ON rm1.room_id = rm2.room_id
       WHERE rm1.user_id = $1 AND rm2.user_id = $2`,
      [userId1, userId2]
    );
    return commonRoom.rows.length > 0;
  }

  static async getRoomIdsForUser(userId: string) {
    const result = await query('SELECT room_id FROM room_members WHERE user_id = $1', [userId]);
    return result.rows.map(row => row.room_id);
  }

  static async getRoomMembers(roomId: string, excludeUserId?: string) {
    let sql = 'SELECT user_id FROM room_members WHERE room_id = $1';
    const params: any[] = [roomId];
    if (excludeUserId) {
      sql += ' AND user_id != $2';
      params.push(excludeUserId);
    }
    const result = await query(sql, params);
    return result.rows.map(row => row.user_id);
  }
}

