import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RefreshTokenService } from './refresh-token.service';
import { RefreshTokenEntity } from './entities/refresh-token.entity';

/**
 * In-memory stand-ins for the TypeORM Repository and DataSource that this
 * service touches. The implementation only uses:
 *   - repo.insert
 *   - repo.update (with where + new state)
 *   - repo.delete (purgeExpired)
 *   - dataSource.transaction
 *   - inside the tx: em.getRepository(RefreshTokenEntity).{findOne, update via QB, save, update}
 */
function makeStubs() {
  const rows: RefreshTokenEntity[] = [];
  let nextId = 1;

  const tokenRepo = {
    findOne: jest.fn(async ({ where }: { where: Partial<RefreshTokenEntity> }) =>
      rows.find((r) => Object.entries(where).every(([k, v]) => (r as never)[k] === v)) ?? null,
    ),
    insert: jest.fn(async (data: Partial<RefreshTokenEntity>) => {
      const row = { id: String(nextId++), revokedAt: null, replacedBy: null, ...data } as RefreshTokenEntity;
      rows.push(row);
      return { identifiers: [{ id: row.id }] };
    }),
    save: jest.fn(async (data: RefreshTokenEntity) => {
      const row = { ...data, id: data.id ?? String(nextId++) };
      const idx = rows.findIndex((r) => r.id === row.id);
      if (idx >= 0) rows[idx] = row;
      else rows.push(row);
      return row;
    }),
    create: (data: Partial<RefreshTokenEntity>) => data as RefreshTokenEntity,
    update: jest.fn(async (where: Partial<RefreshTokenEntity>, patch: Partial<RefreshTokenEntity>) => {
      let affected = 0;
      for (const row of rows) {
        const matches = Object.entries(where).every(([k, v]) => {
          // Crude IsNull() matcher — TypeORM's FindOperator instances expose
          // `_type` (or `type`) on a non-Date object.
          if (v && typeof v === 'object' && !(v instanceof Date)) {
            const op = v as unknown as Record<string, unknown>;
            if ('_type' in op || 'type' in op) {
              return (row as never)[k] == null;
            }
          }
          return (row as never)[k] === v;
        });
        if (matches) {
          Object.assign(row, patch);
          affected++;
        }
      }
      return { affected };
    }),
    createQueryBuilder: () => ({
      update: () => ({
        set: (patch: Partial<RefreshTokenEntity>) => ({
          where: (clause: string, params: { id: string }) => ({
            execute: async () => {
              const row = rows.find((r) => r.id === params.id && r.revokedAt == null);
              void clause;
              if (!row) return { affected: 0 };
              Object.assign(row, patch);
              return { affected: 1 };
            },
          }),
        }),
      }),
    }),
    delete: jest.fn(async () => ({ affected: 0 })),
  };

  const tokenRepoFor = (e: unknown) => {
    void e;
    return tokenRepo;
  };
  const dataSource = {
    transaction: async <T>(work: (em: { getRepository: typeof tokenRepoFor }) => Promise<T>): Promise<T> => {
      return work({ getRepository: tokenRepoFor });
    },
  };

  return { rows, tokenRepo, dataSource };
}

const cfg = {
  get: () => ({ jwt: { refreshTtl: 3600, accessTtl: 60, secret: 'x'.repeat(32) } }),
} as unknown as ConfigService;

describe('RefreshTokenService', () => {
  it('issues a new token and stores its hash (never the raw)', async () => {
    const { rows, tokenRepo, dataSource } = makeStubs();
    const svc = new RefreshTokenService(tokenRepo as never, dataSource as never, cfg);
    const raw = await svc.issue('42', { ip: '127.0.0.1', userAgent: 'jest' });
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toBe(raw);
    expect(rows[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rotates: revokes old, issues new, links replaced_by', async () => {
    const { rows, tokenRepo, dataSource } = makeStubs();
    const svc = new RefreshTokenService(tokenRepo as never, dataSource as never, cfg);
    const oldRaw = await svc.issue('42', {});
    const oldRow = rows[0];

    const { raw: newRaw, userId } = await svc.rotate(oldRaw, {});
    expect(userId).toBe('42');
    expect(newRaw).not.toBe(oldRaw);
    expect(rows).toHaveLength(2);
    expect(oldRow.revokedAt).toBeInstanceOf(Date);
    expect(oldRow.replacedBy).toBe(rows[1].id);
  });

  it('rejects rotation of an already-revoked token', async () => {
    const { tokenRepo, dataSource } = makeStubs();
    const svc = new RefreshTokenService(tokenRepo as never, dataSource as never, cfg);
    const raw = await svc.issue('42', {});
    await svc.rotate(raw, {});
    await expect(svc.rotate(raw, {})).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects rotation of an unknown token', async () => {
    const { tokenRepo, dataSource } = makeStubs();
    const svc = new RefreshTokenService(tokenRepo as never, dataSource as never, cfg);
    await expect(svc.rotate('totally-fake', {})).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects rotation of an expired token', async () => {
    const { rows, tokenRepo, dataSource } = makeStubs();
    const svc = new RefreshTokenService(tokenRepo as never, dataSource as never, cfg);
    const raw = await svc.issue('42', {});
    rows[0].expiresAt = new Date(Date.now() - 1_000);
    await expect(svc.rotate(raw, {})).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revoke() flips revokedAt for the matching active row', async () => {
    const { rows, tokenRepo, dataSource } = makeStubs();
    const svc = new RefreshTokenService(tokenRepo as never, dataSource as never, cfg);
    const raw = await svc.issue('42', {});
    await svc.revoke(raw);
    expect(rows[0].revokedAt).toBeInstanceOf(Date);
  });

  it('revokeAllForUser flips every active row for the user', async () => {
    const { rows, tokenRepo, dataSource } = makeStubs();
    const svc = new RefreshTokenService(tokenRepo as never, dataSource as never, cfg);
    await svc.issue('42', {});
    await svc.issue('42', {});
    await svc.issue('99', {});
    await svc.revokeAllForUser('42');
    expect(rows.filter((r) => r.userId === '42').every((r) => !!r.revokedAt)).toBe(true);
    expect(rows.filter((r) => r.userId === '99').every((r) => !r.revokedAt)).toBe(true);
  });
});
