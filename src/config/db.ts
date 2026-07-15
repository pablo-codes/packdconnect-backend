import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  connectionTimeoutMillis: 2000,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('[Database] Unexpected error on idle client:', err);
});

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Database] Executed query: ${text.slice(0, 100)}${text.length > 100 ? '...' : ''} (${duration}ms)`);
  }
  return res;
}

export async function initDatabase() {
  let client;
  try {
    console.log('[Database] Connecting to PostgreSQL...');
    // Test connection
    client = await pool.connect();
    console.log('[Database] Connection successful. Initializing schema...');
    
    // Read schema.sql
    const schemaPath = path.resolve(__dirname, '../../sql/schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    await client.query(schemaSql);
    console.log('[Database] Schema initialized successfully.');
  } catch (error) {
    console.error('[Database] Initialization error:', error);
    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
}

export default pool;
