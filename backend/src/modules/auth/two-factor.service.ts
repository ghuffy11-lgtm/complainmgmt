import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import * as crypto from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { UserEntity } from './entities/user.entity';
import { UserBackupCodeEntity } from './entities/user-backup-code.entity';
import { SecretCipher } from './crypto/secret-cipher';
import { AppConfig } from '../../config/configuration';

/** How many backup codes to generate at enrollment. */
export const BACKUP_CODE_COUNT = 10;

/** Length of each backup code in characters (Crockford-base32, no I/L/O/U). */
const BACKUP_CODE_LEN = 10;

/** Crockford base32 alphabet — readable, removes ambiguous chars. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const CHALLENGE_AUDIENCE = '2fa-challenge';
const CHALLENGE_TTL_SEC = 5 * 60;

type ChallengeClaims = {
  sub: string;     // user id
  jti: string;     // single-use id; consumed on verify
  aud: typeof CHALLENGE_AUDIENCE;
};

// In-memory single-use store for challenge tokens. A consumed jti can
// not be replayed within the process lifetime; entries auto-expire
// after the challenge TTL. For multi-process deployments this would
// need to move to Redis or the DB; today the backend is single-process.
const consumedJti = new Map<string, number>();

function pruneConsumed(now: number) {
  for (const [k, exp] of consumedJti) {
    if (exp <= now) consumedJti.delete(k);
  }
}

@Injectable()
export class TwoFactorService {
  private readonly log = new Logger(TwoFactorService.name);
  private readonly issuer: string;

  constructor(
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(UserBackupCodeEntity)
    private readonly codes: Repository<UserBackupCodeEntity>,
    private readonly cipher: SecretCipher,
    private readonly jwt: JwtService,
    cfg: ConfigService,
    private readonly dataSource: DataSource,
  ) {
    void cfg.get<AppConfig>('app');
    this.issuer = 'CTS'; // shows up in the authenticator app
    // 30s step, 6 digits, ±1 step drift tolerance.
    authenticator.options = { step: 30, digits: 6, window: 1 };
  }

  /** Whether the cipher (and therefore enrollment / verification) is usable. */
  isConfigured(): boolean {
    return this.cipher.isConfigured();
  }

  isEnrolled(user: UserEntity): boolean {
    return !!user.totpEnrolledAt && !!user.totpSecretEnc;
  }

  // ─── Setup / Enable ────────────────────────────────────────────────────

  /** Generate a fresh secret + otpauth URL + QR-code SVG. The secret is
   *  returned to the caller (in the response body) so the user can either
   *  scan the QR or paste the key into their authenticator. The secret
   *  is NOT persisted at this stage — only after `enable()` succeeds. */
  async setup(user: UserEntity): Promise<{
    provisionalSecret: string;
    otpauthUrl: string;
    qrSvg: string;
  }> {
    this.cipher.isConfigured(); // throws TOTP_NOT_CONFIGURED via cipher when used
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(user.username, this.issuer, secret);
    // Without an explicit `width`, the qrcode library emits an SVG with
    // only `viewBox` set — browsers then render it at the viewBox size
    // (~35px), which looks like a tiny smudge. Setting `width` adds an
    // explicit `width` and `height` attribute on the <svg> so it
    // renders at a scannable size.
    const qrSvg = await QRCode.toString(otpauthUrl, { type: 'svg', margin: 1, width: 240 });
    return { provisionalSecret: secret, otpauthUrl, qrSvg };
  }

  /** Confirm the user controls the provisional secret by verifying their
   *  first 6-digit code. On success, persist the encrypted secret +
   *  generate 10 single-use backup codes (the *only* time they're
   *  visible in plaintext). Returns the plaintext codes for one-time
   *  display; the DB stores hashes only. */
  async enable(
    userId: string,
    provisionalSecret: string,
    code: string,
  ): Promise<{ backupCodes: string[] }> {
    if (!authenticator.check(code, provisionalSecret)) {
      const e: Error & { code?: string } = new Error('2FA_CODE_INVALID');
      e.code = '2FA_CODE_INVALID';
      throw e;
    }
    const enc = this.cipher.encrypt(provisionalSecret);
    const backupCodes = this.generateBackupCodes(BACKUP_CODE_COUNT);
    const hashed = await Promise.all(backupCodes.map((c) => bcrypt.hash(c, 10)));

    await this.dataSource.transaction(async (em) => {
      const userRepo = em.getRepository(UserEntity);
      const codeRepo = em.getRepository(UserBackupCodeEntity);
      // Wipe any stale codes (re-enrollment scenario after a reset).
      await codeRepo.delete({ userId });
      await userRepo.update(
        { id: userId },
        {
          totpSecretEnc: enc,
          totpEnrolledAt: new Date(),
          failed2faCount: 0,
        },
      );
      await codeRepo.insert(hashed.map((codeHash) => ({ userId, codeHash })));
    });

    return { backupCodes };
  }

  // ─── Disable / Reset ───────────────────────────────────────────────────

  /** Clear the secret + all backup codes. Used both for self-disable
   *  (T-428) and admin reset (T-441). Idempotent. */
  async clear(userId: string): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      await em.getRepository(UserEntity).update(
        { id: userId },
        { totpSecretEnc: null, totpEnrolledAt: null, failed2faCount: 0 },
      );
      await em.getRepository(UserBackupCodeEntity).delete({ userId });
    });
  }

  // ─── Verify ────────────────────────────────────────────────────────────

  /** Verify a 6-digit TOTP. The user must already be enrolled.
   *  Returns true on success; does NOT mutate state — counter logic
   *  lives in the calling endpoint so it can also try backup codes. */
  verifyTotp(user: UserEntity, code: string): boolean {
    if (!user.totpSecretEnc) return false;
    let secret: string;
    try {
      secret = this.cipher.decrypt(user.totpSecretEnc).toString('utf8');
    } catch (err) {
      this.log.error({ err, userId: user.id }, 'failed to decrypt TOTP secret');
      return false;
    }
    return authenticator.check(code, secret);
  }

  /** Match `code` against the user's unused backup codes. On match,
   *  mark the row used and return true. Single-use semantics enforced
   *  by the `used_at IS NULL` filter in the UPDATE. */
  async verifyAndConsumeBackupCode(userId: string, code: string): Promise<boolean> {
    const normalized = code.replace(/[\s-]/g, '').toUpperCase();
    if (normalized.length === 0) return false;
    const candidates = await this.codes.find({
      where: { userId, usedAt: IsNull() },
    });
    for (const row of candidates) {
      // bcrypt is intentionally slow; with at most 10 active codes this
      // is bounded. We cannot avoid the loop because bcrypt salts each
      // hash differently — there's no constant-time index lookup.
      const match = await bcrypt.compare(normalized, row.codeHash);
      if (match) {
        const upd = await this.codes
          .createQueryBuilder()
          .update(UserBackupCodeEntity)
          .set({ usedAt: new Date() })
          .where('id = :id AND used_at IS NULL', { id: row.id })
          .execute();
        return upd.affected === 1;
      }
    }
    return false;
  }

  // ─── Challenge tokens ──────────────────────────────────────────────────

  /** Issue a short-lived single-use JWT representing "this user has
   *  passed the password step but not yet TOTP". The token is the only
   *  thing the client needs to send to /auth/2fa/verify; binding to a
   *  separate audience ensures it can't be used as a session token. */
  async issueChallengeToken(userId: string): Promise<string> {
    const jti = crypto.randomUUID();
    return this.jwt.signAsync(
      { sub: String(userId), jti, aud: CHALLENGE_AUDIENCE } satisfies ChallengeClaims,
      { expiresIn: CHALLENGE_TTL_SEC },
    );
  }

  /** Validate + consume a challenge token. Returns the userId on
   *  success. Throws on: invalid signature, wrong audience, expired,
   *  or already-consumed jti. */
  async consumeChallengeToken(token: string): Promise<string> {
    pruneConsumed(Date.now());
    let claims: ChallengeClaims;
    try {
      claims = await this.jwt.verifyAsync<ChallengeClaims>(token);
    } catch {
      const e: Error & { code?: string } = new Error('2FA_CHALLENGE_INVALID');
      e.code = '2FA_CHALLENGE_INVALID';
      throw e;
    }
    if (claims.aud !== CHALLENGE_AUDIENCE) {
      const e: Error & { code?: string } = new Error('2FA_CHALLENGE_INVALID');
      e.code = '2FA_CHALLENGE_INVALID';
      throw e;
    }
    if (consumedJti.has(claims.jti)) {
      const e: Error & { code?: string } = new Error('2FA_CHALLENGE_INVALID');
      e.code = '2FA_CHALLENGE_INVALID';
      throw e;
    }
    consumedJti.set(claims.jti, Date.now() + CHALLENGE_TTL_SEC * 1000);
    return claims.sub;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private generateBackupCodes(n: number): string[] {
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const bytes = crypto.randomBytes(BACKUP_CODE_LEN);
      let s = '';
      for (let j = 0; j < BACKUP_CODE_LEN; j++) {
        s += ALPHABET[bytes[j] % ALPHABET.length];
      }
      // Format as XXXXX-XXXXX for legibility — strip dashes on input.
      out.push(`${s.slice(0, 5)}-${s.slice(5)}`);
    }
    return out;
  }
}
