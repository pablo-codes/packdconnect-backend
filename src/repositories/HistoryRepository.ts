import { query } from '../config/db.js';

export class HistoryRepository {
  static async getActivityHistory(userId: string, limit: number, offset: number) {
    const sql = `
      WITH user_rooms AS (
        SELECT rm_self.room_id, p.peer_id, p.peer_name, p.peer_email
        FROM room_members rm_self
        LEFT JOIN LATERAL (
          SELECT u.id::text AS peer_id, u.username AS peer_name, u.email AS peer_email
          FROM room_members rm_peer
          JOIN users u ON rm_peer.user_id = u.id
          WHERE rm_peer.room_id = rm_self.room_id AND rm_peer.user_id != $1
          LIMIT 1
        ) p ON TRUE
        WHERE rm_self.user_id = $1
      ),
      latest_messages AS (
        SELECT DISTINCT ON (m.room_id)
          m.id AS id,
          'message' AS type,
          NULL AS call_type,
          NULL AS status,
          NULL::timestamptz AS started_at,
          NULL::timestamptz AS ended_at,
          m.sender_id AS sender_id,
          m.room_id AS room_id,
          m.created_at AS time,
          CASE WHEN length(m.content) > 30 THEN LEFT(m.content, 30) || '...' ELSE m.content END AS content_preview
        FROM messages m
        JOIN user_rooms ur ON m.room_id = ur.room_id
        ORDER BY m.room_id, m.created_at DESC
      ),
      calls AS (
        SELECT 
          c.id AS id,
          'call' AS type,
          c.call_type AS call_type,
          c.status AS status,
          c.started_at AS started_at,
          c.ended_at AS ended_at,
          c.host_id AS sender_id,
          c.room_id AS room_id,
          COALESCE(c.started_at, c.ended_at) AS time,
          NULL::text AS content_preview
        FROM call_logs c
        JOIN user_rooms ur ON c.room_id = ur.room_id
      ),
      unified_history AS (
        SELECT * FROM latest_messages
        UNION ALL
        SELECT * FROM calls
      )
      SELECT 
        uh.*,
        ur.peer_id,
        ur.peer_name,
        ur.peer_email
      FROM unified_history uh
      JOIN user_rooms ur ON uh.room_id = ur.room_id
      ORDER BY uh.time DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await query(sql, [userId, limit, offset]);
    return result.rows;
  }
}
