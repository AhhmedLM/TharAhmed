import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export const isDbConfigured = Boolean(
  process.env.SQL_HOST && process.env.SQL_USER && process.env.SQL_DB_NAME
);

let _db: NodePgDatabase<typeof schema> | null = null;

export const createPool = (): Pool | null => {
  if (!isDbConfigured) return null;
  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10,
      connectionTimeoutMillis: 15000,
    });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

export function getDb(): NodePgDatabase<typeof schema> | null {
  if (!isDbConfigured) return null;
  if (!_db) {
    const pool = createPool();
    if (!pool) return null;
    _db = drizzle(pool, { schema });
  }
  return _db;
}

export const db = getDb();
