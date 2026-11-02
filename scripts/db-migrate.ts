/**
 * Applique, dans l'ordre, les fichiers supabase/migrations/*.sql qui n'ont pas encore été appliqués.
 * Usage : npm run db:migrate   (lit DATABASE_URL dans .env, comme le serveur)
 * L'historique est conservé dans la table schema_migrations ; chaque fichier s'exécute dans une transaction.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createPool } from '../src/db/index.ts';

async function main() {
  const pool = createPool();
  const dir = path.resolve(process.cwd(), 'supabase', 'migrations');
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort();

  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`
  );
  const done = new Set((await pool.query(`SELECT name FROM schema_migrations`)).rows.map((r: any) => r.name));

  let applied = 0;
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf-8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [file]);
      await client.query('COMMIT');
      console.log(`✔ ${file} appliquée`);
      applied++;
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error(`✖ ${file} : ${err.message}`);
      process.exitCode = 1;
      break;
    } finally {
      client.release();
    }
  }
  if (!applied && !process.exitCode) console.log('Base déjà à jour.');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
