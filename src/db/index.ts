import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    const isUnixSocket = typeof process.env.SQL_HOST === 'string' && process.env.SQL_HOST.startsWith('/');

    // Configuration SSL explicite pour le pool PostgreSQL (TCP distant, Cloud SQL, Supabase, Neon)
    let sslConfig: boolean | { rejectUnauthorized: boolean } | undefined = undefined;
    if (process.env.DB_SSL === 'false' || process.env.SQL_SSL === 'false') {
      sslConfig = false;
    } else if (process.env.DB_SSL === 'true' || process.env.SQL_SSL === 'true') {
      sslConfig = { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' };
    } else if (process.env.DATABASE_URL) {
      const urlHasDisable = process.env.DATABASE_URL.includes('sslmode=disable');
      sslConfig = urlHasDisable ? false : { rejectUnauthorized: false };
    } else if (process.env.SQL_HOST && !isUnixSocket) {
      // Connexion TCP unitaire : SSL activé explicitement
      sslConfig = { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' };
    } else if (isUnixSocket) {
      // Socket Unix local IPC
      sslConfig = false;
    }

    const poolConfig = process.env.DATABASE_URL
      ? {
          connectionString: process.env.DATABASE_URL,
          ssl: sslConfig,
          max: 10,
          connectionTimeoutMillis: 15000,
        }
      : {
          host: process.env.SQL_HOST,
          user: process.env.SQL_USER,
          password: process.env.SQL_PASSWORD,
          database: process.env.SQL_DB_NAME,
          ssl: sslConfig,
          max: 10,
          connectionTimeoutMillis: 15000,
        };

    global._postgresPool = new Pool(poolConfig);

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });
export { pool };
