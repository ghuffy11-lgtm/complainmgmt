import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository, IsNull, LessThanOrEqual } from 'typeorm';
import * as crypto from 'node:crypto';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { AppConfig } from '../../config/configuration';

@Injectable()
export class RefreshTokenService {
  private readonly ttlSec: number;

  constructor(
    @InjectRepository(RefreshTokenEntity) private readonly repo: Repository<RefreshTokenEntity>,
    private readonly dataSource: DataSource,
    cfg: ConfigService,
  ) {
    this.ttlSec = cfg.get<AppConfig>('app')!.jwt.refreshTtl;
  }

  private hash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private mintRaw(): string {
    return crypto.randomBytes(48).toString('base64url');
  }

  /** Issue a fresh refresh token for `userId`. Returns the raw token (the only time it exists in plaintext). */
  async issue(userId: string, ctx: { ip?: string; userAgent?: string }): Promise<string> {
    const raw = this.mintRaw();
    await this.repo.insert({
      userId,
      tokenHash: this.hash(raw),
      expiresAt: new Date(Date.now() + this.ttlSec * 1000),
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return raw;
  }

  /**
   * Validate `raw`, revoke it, issue a replacement — atomically.
   *
   * Atomicity matters: without a transaction, two concurrent refreshes with
   * the same token could each see the row as still-valid and each issue a
   * new token, defeating the rotation guarantee. We use a transaction with
   * a conditional UPDATE so only one caller wins the revoke; the other gets
   * INVALID_REFRESH_TOKEN.
   */
  async rotate(raw: string, ctx: { ip?: string; userAgent?: string }): Promise<{ userId: string; raw: string }> {
    const tokenHash = this.hash(raw);
    return this.dataSource.transaction(async (em) => {
      const tokenRepo = em.getRepository(RefreshTokenEntity);
      const row = await tokenRepo.findOne({ where: { tokenHash } });
      if (!row || row.revokedAt || row.expiresAt <= new Date()) {
        throw new UnauthorizedException({ code: 'INVALID_REFRESH_TOKEN' });
      }

      // Conditional revoke: only succeed if the row is still un-revoked.
      // A second concurrent caller will get affected = 0 and bail.
      const revoke = await tokenRepo
        .createQueryBuilder()
        .update(RefreshTokenEntity)
        .set({ revokedAt: new Date() })
        .where('id = :id AND revoked_at IS NULL', { id: row.id })
        .execute();

      if (revoke.affected !== 1) {
        throw new UnauthorizedException({ code: 'INVALID_REFRESH_TOKEN' });
      }

      const newRaw = this.mintRaw();
      const inserted = await tokenRepo.save(
        tokenRepo.create({
          userId: row.userId,
          tokenHash: this.hash(newRaw),
          expiresAt: new Date(Date.now() + this.ttlSec * 1000),
          ip: ctx.ip ?? null,
          userAgent: ctx.userAgent ?? null,
        }),
      );
      await tokenRepo.update({ id: row.id }, { replacedBy: inserted.id });

      return { userId: row.userId, raw: newRaw };
    });
  }

  async revoke(raw: string): Promise<void> {
    await this.repo.update({ tokenHash: this.hash(raw), revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.repo.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  /** Housekeeping (called on a schedule, roadmap). */
  async purgeExpired(): Promise<number> {
    const r = await this.repo.delete({ expiresAt: LessThanOrEqual(new Date()) });
    return r.affected ?? 0;
  }
}
