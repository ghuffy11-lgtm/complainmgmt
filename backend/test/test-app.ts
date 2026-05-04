import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';

export type TestApp = {
  app: INestApplication;
  http: import('http').Server;
  close: () => Promise<void>;
};

/**
 * Boot the full Nest application against the test DB. Caller is responsible
 * for calling `close()` in afterAll.
 */
export async function bootTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  const http = app.getHttpServer();
  return {
    app,
    http,
    close: async () => { await app.close(); },
  };
}

/**
 * Seed an admin-equipped user with the `admin` role (which has every
 * permission per the seed migration). Returns the username + plaintext
 * password the caller can log in with.
 */
export async function seedAdminUser(opts: { username: string; password: string }): Promise<void> {
  const url = process.env.DATABASE_URL!;
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    const hash = await bcrypt.hash(opts.password, 4);
    const ins = await c.query<{ id: string }>(
      `INSERT INTO users (username, display_name, password_hash, auth_provider)
       VALUES ($1, $1, $2, 'local')
       ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash
       RETURNING id`,
      [opts.username, hash],
    );
    const userId = ins.rows[0].id;
    await c.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, id FROM roles WHERE key = 'admin'
       ON CONFLICT DO NOTHING`,
      [userId],
    );
  } finally {
    await c.end();
  }
}

/**
 * Truncate user-data tables so each test starts from a known state.
 * (Roles, permissions, system fields, settings stay seeded.)
 */
export async function resetUserData(): Promise<void> {
  const url = process.env.DATABASE_URL!;
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    await c.query(`
      TRUNCATE TABLE
        complaint_audit_log,
        complaint_assignment_history,
        complaint_attachments,
        complaint_field_values,
        complaints,
        complaint_reference_sequence,
        auth_refresh_tokens,
        user_roles,
        users
      RESTART IDENTITY CASCADE;
    `);
  } finally {
    await c.end();
  }
}
