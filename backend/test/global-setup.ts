import { Client } from 'pg';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Jest global setup for e2e tests.
 *
 * Connects to the Postgres pointed at by `TEST_DATABASE_URL` (default
 * `postgres://cts_app:cts_app@127.0.0.1:5432/cts_test`), drops + recreates the
 * `public` schema, then applies every migration under `db/migrations/*.sql`
 * in lexicographic order.
 *
 * Why drop/recreate every run? It's slow but airtight — every test starts
 * from the documented schema. With ~9 small migrations the setup completes
 * in well under a second.
 *
 * Use a *separate database* from your dev work — the cleanup is destructive.
 */
export default async function globalSetup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL
    ?? 'postgres://cts_app:cts_app@127.0.0.1:5432/cts_test';
  process.env.DATABASE_URL = url;

  // The app reads JWT_SECRET / NODE_ENV at boot — supply minima so it boots clean.
  process.env.NODE_ENV ??= 'test';
  process.env.JWT_SECRET ??= 'x'.repeat(48);
  process.env.BCRYPT_ROUNDS ??= '4';      // keep tests fast
  process.env.CORS_ORIGINS ??= '';

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
    await client.query('GRANT ALL ON SCHEMA public TO PUBLIC');

    const migrationsDir = path.resolve(__dirname, '../../db/migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const f of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
      // eslint-disable-next-line no-console
      console.log(`  [e2e setup] applying ${f}`);
      await client.query(sql);
    }
  } finally {
    await client.end();
  }
}
