import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    const isUnixSocket = typeof process.env.SQL_HOST === 'string' && process.env.SQL_HOST.startsWith('/');

    // Vérification du certificat TLS ACTIVÉE par défaut (protection contre l'interception).
    // Désactivation explicite possible uniquement via DB_SSL_REJECT_UNAUTHORIZED=false
    // (ex. Cloud SQL en IP publique avec certificat d'autorité privée, à remplacer idéalement par le connecteur Cloud SQL / une CA fournie).
    const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';
    // Certificat d'autorité (PEM) du fournisseur, ex. Supabase : DB_SSL_CA contient le texte du certificat
    // (les retours à la ligne peuvent être écrits \n).
    const caPem = process.env.DB_SSL_CA ? process.env.DB_SSL_CA.replace(/\\n/g, '\n') : undefined;
    const sslOptions = { rejectUnauthorized, ...(caPem ? { ca: caPem } : {}) };
    if (!rejectUnauthorized) {
      console.warn('[DB] DB_SSL_REJECT_UNAUTHORIZED=false : le certificat TLS de la base de données n’est PAS vérifié.');
    }

    // Configuration SSL explicite pour le pool PostgreSQL (TCP distant, Cloud SQL, Supabase, Neon)
    let sslConfig: boolean | { rejectUnauthorized: boolean; ca?: string } | undefined = undefined;
    if (process.env.DB_SSL === 'false' || process.env.SQL_SSL === 'false') {
      sslConfig = false;
    } else if (process.env.DB_SSL === 'true' || process.env.SQL_SSL === 'true') {
      sslConfig = sslOptions;
    } else if (process.env.DATABASE_URL) {
      const urlHasDisable = process.env.DATABASE_URL.includes('sslmode=disable');
      sslConfig = urlHasDisable ? false : sslOptions;
    } else if (process.env.SQL_HOST && !isUnixSocket) {
      // Connexion TCP : SSL activé explicitement
      sslConfig = sslOptions;
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
