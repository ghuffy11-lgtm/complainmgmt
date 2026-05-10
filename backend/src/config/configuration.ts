import * as Joi from 'joi';

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  databaseUrl: string;
  jwt: { secret: string; accessTtl: number; refreshTtl: number };
  bcryptRounds: number;
  attachments: { maxFilesPerComplaint: number; maxBytes: number };
  corsOrigins: string[];
  initialAdmin?: { username: string; password: string; displayName: string };
  /**
   * Base64-encoded 32-byte key for AES-256-GCM encryption of TOTP
   * secrets. Optional — when unset, the 2FA endpoints respond with
   * `TOTP_NOT_CONFIGURED` so the rest of the app keeps working until
   * the operator generates a key and redeploys.
   */
  totpEncryptionKey?: string;
}

export const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(3000),
  DATABASE_URL: Joi.string().uri({ scheme: ['postgres', 'postgresql'] }).required(),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.number().integer().min(60).default(900),
  JWT_REFRESH_TTL: Joi.number().integer().min(3600).default(60 * 60 * 24 * 7),
  BCRYPT_ROUNDS: Joi.number().integer().min(8).max(15).default(12),
  ATTACHMENT_MAX_FILES_PER_COMPLAINT: Joi.number().integer().min(1).max(10).default(5),
  ATTACHMENT_MAX_BYTES: Joi.number().integer().min(1024).default(2 * 1024 * 1024),
  CORS_ORIGINS: Joi.string().default(''),
  // INITIAL_ADMIN_* are bootstrap-only — used at first boot to seed the
  // initial admin row, ignored once that row exists. After bootstrap,
  // operators typically blank the password line in `.env` for safety.
  // Accept '' as well as missing-from-input so a cleaned-up .env doesn't
  // crash the next restart. `loadConfig()` below treats '' as "absent"
  // when deciding whether to attempt the bootstrap insert.
  INITIAL_ADMIN_USERNAME: Joi.string().allow('').optional(),
  INITIAL_ADMIN_PASSWORD: Joi.alternatives()
    .try(Joi.string().min(10), Joi.string().valid(''))
    .optional(),
  INITIAL_ADMIN_DISPLAY_NAME: Joi.string().allow('').optional(),
  // 32 raw bytes → 44 chars in base64 with padding, 43 unpadded.
  // Length validation here is a quick guard — exact length is enforced
  // at cipher construction time (SecretCipher.create). Empty allowed
  // so an operator who hasn't generated one yet still gets a healthy
  // boot; the 2FA endpoints respond with TOTP_NOT_CONFIGURED instead.
  TOTP_ENCRYPTION_KEY: Joi.alternatives()
    .try(Joi.string().min(43), Joi.string().valid(''))
    .optional(),
}).unknown(true);

export function loadConfig(): AppConfig {
  const env = process.env;
  const initialAdminUser = env.INITIAL_ADMIN_USERNAME;
  const initialAdminPw = env.INITIAL_ADMIN_PASSWORD;
  return {
    nodeEnv: (env.NODE_ENV as AppConfig['nodeEnv']) ?? 'development',
    port: parseInt(env.PORT ?? '3000', 10),
    databaseUrl: env.DATABASE_URL!,
    jwt: {
      secret: env.JWT_SECRET!,
      accessTtl: parseInt(env.JWT_ACCESS_TTL ?? '900', 10),
      refreshTtl: parseInt(env.JWT_REFRESH_TTL ?? '604800', 10),
    },
    bcryptRounds: parseInt(env.BCRYPT_ROUNDS ?? '12', 10),
    attachments: {
      maxFilesPerComplaint: parseInt(env.ATTACHMENT_MAX_FILES_PER_COMPLAINT ?? '5', 10),
      maxBytes: parseInt(env.ATTACHMENT_MAX_BYTES ?? String(2 * 1024 * 1024), 10),
    },
    corsOrigins: (env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    initialAdmin:
      initialAdminUser && initialAdminPw
        ? {
            username: initialAdminUser,
            password: initialAdminPw,
            displayName: env.INITIAL_ADMIN_DISPLAY_NAME ?? 'Administrator',
          }
        : undefined,
    totpEncryptionKey: env.TOTP_ENCRYPTION_KEY,
  };
}
