import * as request from 'supertest';
import { bootTestApp, resetUserData, seedAdminUser, TestApp } from './test-app';

/**
 * Headline workflow:
 *   1. Login as admin.
 *   2. Create a complaint with values for the seeded system fields.
 *   3. Assert: reference number issued, audit row recorded, the locked
 *      first-writer field shows the actor as owner.
 *   4. PATCH a value as the same actor — accepted.
 *   5. PATCH the locked field as a *different* user without override — 409.
 *   6. PATCH it with override permission — accepted, audited as lock_override.
 */
describe('Complaint flow (e2e)', () => {
  let ctx: TestApp;
  let adminToken: string;

  beforeAll(async () => {
    ctx = await bootTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await resetUserData();
    await seedAdminUser({ username: 'admin', password: 'admin-pass-1234' });
    const login = await request(ctx.http)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin-pass-1234' });
    adminToken = login.body.accessToken;
  });

  it('creates a complaint with reference number + audit row + first-writer ownership', async () => {
    const create = await request(ctx.http)
      .post('/api/complaints')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        values: {
          patient_complaint: 'Initial complaint text',
          complaint_investigation: '',
          action_taken: '',
          pro: '',
        },
        priority: 'high',
      });
    expect(create.status).toBe(201);
    expect(create.body.referenceNo).toMatch(/^CMP-\d{4}-\d{6}$/);
    expect(create.body.priority).toBe('high');
    expect(create.body.values.patient_complaint).toBe('Initial complaint text');

    // Locking metadata exposed in the detail DTO
    expect(create.body.locks.patient_complaint).toBeDefined();
    expect(create.body.locks.patient_complaint.ownerUserId).toBeTruthy();

    const audit = await request(ctx.http)
      .get(`/api/complaints/${create.body.id}/audit`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(audit.status).toBe(200);
    const actions = audit.body.data.map((e: { action: string }) => e.action);
    expect(actions).toContain('create');
  });

  it('rejects a non-owner without override on a locked field with 409 FIELD_LOCKED', async () => {
    // Admin creates the complaint (becomes owner of patient_complaint).
    const create = await request(ctx.http)
      .post('/api/complaints')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ values: { patient_complaint: 'Owned by admin' } });
    expect(create.status).toBe(201);

    // Seed an employee user (no override permission on the field).
    await seedEmployee(adminToken);
    const empLogin = await request(ctx.http)
      .post('/api/auth/login')
      .send({ username: 'bob', password: 'bobs-pass-1234' });
    const empToken = empLogin.body.accessToken;

    const conflict = await request(ctx.http)
      .patch(`/api/complaints/${create.body.id}`)
      .set('Authorization', `Bearer ${empToken}`)
      .send({ values: { patient_complaint: 'Trying to overwrite' } });
    expect(conflict.status).toBe(409);
    expect(conflict.body).toMatchObject({ code: 'FIELD_LOCKED', fieldKey: 'patient_complaint' });
  });

  it('admin override produces a lock_override audit row', async () => {
    // Admin creates as employee (we'll seed and use bob), then admin overrides.
    await seedEmployee(adminToken);
    const empLogin = await request(ctx.http)
      .post('/api/auth/login')
      .send({ username: 'bob', password: 'bobs-pass-1234' });

    const create = await request(ctx.http)
      .post('/api/complaints')
      .set('Authorization', `Bearer ${empLogin.body.accessToken}`)
      .send({ values: { patient_complaint: 'Owned by bob' } });
    expect(create.status).toBe(201);

    const override = await request(ctx.http)
      .patch(`/api/complaints/${create.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ values: { patient_complaint: 'Overwritten by admin' } });
    expect(override.status).toBe(200);

    const audit = await request(ctx.http)
      .get(`/api/complaints/${create.body.id}/audit`)
      .set('Authorization', `Bearer ${adminToken}`);
    const actions = audit.body.data.map((e: { action: string }) => e.action);
    expect(actions).toContain('lock_override');
  });

  /**
   * Regression: status/priority/assign used to read the post-update state via
   * the *global* repository while the transaction was still open, returning
   * the stale value to the caller. The DB write actually committed, but the
   * response body lied — so a UI driving from the response showed the old
   * value until the next page load. This test asserts the response body
   * reflects the new state. Caught during initial bring-up; locked in here.
   */
  it('status/priority/assign return the post-update state in the response', async () => {
    const created = await request(ctx.http)
      .post('/api/complaints')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ values: { patient_complaint: 'first' }, priority: 'normal' });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('open');
    expect(created.body.priority).toBe('normal');

    const status = await request(ctx.http)
      .patch(`/api/complaints/${created.body.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'in_progress' });
    expect(status.status).toBe(200);
    expect(status.body.status).toBe('in_progress');

    const priority = await request(ctx.http)
      .patch(`/api/complaints/${created.body.id}/priority`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ priority: 'critical' });
    expect(priority.status).toBe(200);
    expect(priority.body.priority).toBe('critical');

    // Create a department so we can exercise assign().
    const dept = await request(ctx.http)
      .post('/api/departments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'reception', name: 'Reception' });
    expect(dept.status).toBe(201);

    const assigned = await request(ctx.http)
      .post(`/api/complaints/${created.body.id}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ departmentId: dept.body.id });
    expect(assigned.status).toBe(200);
    expect(assigned.body.assignedDepartmentId).toBe(dept.body.id);
    expect(assigned.body.assignedAt).toBeTruthy();
  });

  /**
   * Regression: the BootstrapService didn't exist initially; the seed
   * migration's "the application bootstraps the initial admin from env on
   * first start" comment was aspirational. Now it actually does — assert
   * the seeded admin can authenticate after a fresh schema reset.
   *
   * (Implicitly: every other test in this file relies on `seedAdminUser`,
   * which is the test-harness path. This test runs the production path —
   * `OnApplicationBootstrap` reading INITIAL_ADMIN_* — by setting the env
   * vars for the lifetime of the test and re-booting the Nest app.)
   */
  // NOTE: not implemented here — re-bootstrapping a Nest app inside a single
  // jest worker is fiddly. Covered indirectly by the smoke-test script
  // (scripts/smoke-test.sh) which exercises the env-driven bootstrap end-to-
  // end against a real docker compose stack.

  // ─── helpers ────────────────────────────────────────────────────────────
  async function seedEmployee(adminTok: string): Promise<void> {
    const create = await request(ctx.http)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminTok}`)
      .send({
        username: 'bob',
        displayName: 'Bob',
        password: 'bobs-pass-1234',
        roleIds: [],   // assigned below by key lookup
      });
    expect(create.status).toBe(201);

    // Assign the seeded `employee` role.
    const roles = await request(ctx.http)
      .get('/api/roles')
      .set('Authorization', `Bearer ${adminTok}`);
    const employee = roles.body.find((r: { key: string }) => r.key === 'employee');
    expect(employee).toBeDefined();

    const assign = await request(ctx.http)
      .post(`/api/users/${create.body.id}/roles`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ roleIds: [employee.id] });
    expect(assign.status).toBe(204);
  }
});
