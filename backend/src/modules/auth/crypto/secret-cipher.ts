import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import { AppConfig } from '../../../config/configuration';

const ALG = 'aes-256-gcm';
const NONCE_BYTES = 12; // 96 bits — recommended for GCM
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/**
 * AES-256-GCM wrapper used to keep TOTP secrets encrypted at rest. The
 * stored ciphertext is `nonce || tag || encrypted-bytes`, all glued
 * together as one Buffer so callers don't have to track three separate
 * fields. Round-trip:
 *
 *   const blob = cipher.encrypt(plaintext);   // Buffer to store in DB
 *   const back = cipher.decrypt(blob);        // original Buffer
 *
 * Authenticated encryption: any tampering with the stored bytes (or a
 * key change) flips the GCM tag check and `decrypt` throws.
 *
 * Configured via env var `TOTP_ENCRYPTION_KEY` (base64-encoded 32
 * bytes). When not set, `isConfigured()` returns false and call sites
 * surface a 503 — the rest of the app keeps working without 2FA.
 */
@Injectable()
export class SecretCipher {
  private readonly log = new Logger(SecretCipher.name);
  private readonly key: Buffer | null;

  constructor(cfg: ConfigService) {
    const raw = cfg.get<AppConfig>('app')?.totpEncryptionKey;
    this.key = raw ? this.parseKey(raw) : null;
    if (!this.key) {
      this.log.warn(
        'TOTP_ENCRYPTION_KEY not configured — 2FA endpoints will respond with TOTP_NOT_CONFIGURED until a 32-byte base64 key is set in the environment. Generate one with: openssl rand -base64 32',
      );
    }
  }

  isConfigured(): boolean {
    return this.key !== null;
  }

  /** Throws ServiceUnavailableException with a recognisable error code
   *  so callers can return a clean 503 to the client. */
  private requireKey(): Buffer {
    if (!this.key) {
      throw new ServiceUnavailableException({ code: 'TOTP_NOT_CONFIGURED' });
    }
    return this.key;
  }

  encrypt(plaintext: Buffer | string): Buffer {
    const key = this.requireKey();
    const data = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf8');
    const nonce = crypto.randomBytes(NONCE_BYTES);
    const cipher = crypto.createCipheriv(ALG, key, nonce);
    const enc = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([nonce, tag, enc]);
  }

  decrypt(blob: Buffer): Buffer {
    const key = this.requireKey();
    if (blob.length < NONCE_BYTES + TAG_BYTES) {
      throw new Error('SecretCipher: ciphertext too short — corrupted or wrong format');
    }
    const nonce = blob.subarray(0, NONCE_BYTES);
    const tag = blob.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES);
    const enc = blob.subarray(NONCE_BYTES + TAG_BYTES);
    const decipher = crypto.createDecipheriv(ALG, key, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]);
  }

  private parseKey(raw: string): Buffer {
    let buf: Buffer;
    try {
      buf = Buffer.from(raw, 'base64');
    } catch {
      throw new Error('TOTP_ENCRYPTION_KEY is not valid base64');
    }
    if (buf.length !== KEY_BYTES) {
      throw new Error(
        `TOTP_ENCRYPTION_KEY must decode to exactly ${KEY_BYTES} bytes (got ${buf.length}). Generate one with: openssl rand -base64 32`,
      );
    }
    return buf;
  }
}
