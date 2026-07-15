import { query } from '../config/db.js';

export class ContactRepository {
  static async getContacts(userId: string, search: string, paginate: boolean, limit: number, offset: number) {
    let sql = `
      SELECT 
        u.id AS id, 
        u.username AS username, 
        u.username AS name, 
        u.email AS email, 
        c.created_at AS added_at,
        COUNT(*) OVER() AS total_count
      FROM contacts c
      JOIN users u ON c.contact_user_id = u.id
      WHERE c.user_id = $1
    `;

    const params: any[] = [userId];

    if (search) {
      const escapedSearch = search.replace(/[\\%_]/g, '\\$&');
      sql += ` AND (coalesce(u.username, '') || ' ' || coalesce(u.email, '')) ILIKE $2`;
      params.push(`%${escapedSearch}%`);
    }

    sql += ` ORDER BY u.username ASC`;

    if (paginate) {
      const limitPlaceholder = `$${params.length + 1}`;
      const offsetPlaceholder = `$${params.length + 2}`;
      sql += ` LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`;
      params.push(limit, offset);
    }

    const result = await query(sql, params);
    return result.rows;
  }

  static async contactExists(userId: string, contactUserId: string) {
    const contactCheck = await query(
      'SELECT 1 FROM contacts WHERE user_id = $1 AND contact_user_id = $2',
      [userId, contactUserId]
    );
    return contactCheck.rows.length > 0;
  }

  static async addContact(userId: string, contactUserId: string) {
    await query(
      'INSERT INTO contacts (user_id, contact_user_id) VALUES ($1, $2)',
      [userId, contactUserId]
    );
  }
}
