import { query } from '../config/db.js';

export class CallRepository {
  static async createCallLog(roomId: string, hostId: string, callType: 'voice' | 'video') {
    const result = await query(
      `INSERT INTO call_logs (room_id, host_id, call_type, status) 
       VALUES ($1, $2, $3, 'ringing') 
       RETURNING id, room_id, host_id, call_type, status`,
      [roomId, hostId, callType]
    );
    return result.rows[0];
  }

  static async updateCallStatus(callId: string, fromStatus: string | string[], toStatus: string) {
    const fromStatusArray = Array.isArray(fromStatus) ? fromStatus : [fromStatus];
    const placeholders = fromStatusArray.map((_, i) => `$${i + 3}`).join(', ');
    
    let sql = `UPDATE call_logs SET status = $1`;
    if (toStatus !== 'ringing') {
      sql += `, ended_at = CURRENT_TIMESTAMP`;
    }
    if (toStatus === 'active') {
      sql = `UPDATE call_logs SET status = $1, started_at = CURRENT_TIMESTAMP`;
    }
    
    sql += ` WHERE id = $2 AND status IN (${placeholders})`;

    const result = await query(sql, [toStatus, callId, ...fromStatusArray]);
    return result.rowCount ? result.rowCount > 0 : false;
  }

  static async getCallById(callId: string) {
    const result = await query('SELECT room_id, host_id, status FROM call_logs WHERE id = $1', [callId]);
    return result.rows[0] || null;
  }

  static async getActiveCallsForUser(userId: string) {
    const activeCalls = await query(
      `SELECT id, room_id, host_id, status 
       FROM call_logs 
       WHERE status IN ('ringing', 'active') 
         AND (host_id = $1 OR room_id IN (SELECT room_id FROM room_members WHERE user_id = $1))`,
      [userId]
    );
    return activeCalls.rows;
  }

  static async updateCallStatusForce(callId: string, status: string) {
    await query(
      `UPDATE call_logs 
       SET status = $1, ended_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      [status, callId]
    );
  }
}
