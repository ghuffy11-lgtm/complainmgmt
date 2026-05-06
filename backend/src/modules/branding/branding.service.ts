import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BrandingAssetEntity } from './branding-asset.entity';
import { SystemSettingEntity } from '../admin/system-settings.entity';
import { sniffMime } from '../attachments/file-validation';

const TEXT_KEYS = [
  'organizationName',
  'systemName',
  'systemShortName',
  'loginSubtitle',
  'loginTagline',
  'footerText',
  /** Single primary-colour hex. Hover / active / bg / border variants are
   *  derived client-side from this via HSL math, so the rest of the
   *  palette doesn't need separate settings rows. */
  'primaryColor',
] as const;

type TextKey = typeof TEXT_KEYS[number];

/** Defaults applied when a setting hasn't been set (or has been cleared). */
const DEFAULTS: Record<TextKey, string> = {
  organizationName: 'Hadi Clinic',
  systemName: 'Complaint Tracking System',
  systemShortName: 'CTS',
  loginSubtitle: 'Quality & Patient Safety',
  loginTagline: 'Sign in to continue to the portal',
  footerText: 'Internal use only · Access logged',
  primaryColor: '#2563eb',
};

/** Map between camelCase (frontend) and dotted setting keys (DB). */
const KEY_MAP: Record<TextKey, string> = {
  organizationName: 'branding.organization_name',
  systemName: 'branding.system_name',
  systemShortName: 'branding.system_short_name',
  loginSubtitle: 'branding.login_subtitle',
  loginTagline: 'branding.login_tagline',
  footerText: 'branding.footer_text',
  primaryColor: 'branding.primary_color',
};

const ALLOWED_LOGO_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
const MAX_LOGO_BYTES = 1024 * 1024; // 1 MB — logos should be small but operators sometimes upload uncompressed PNG.

export type BrandingDto = {
  organizationName: string;
  systemName: string;
  systemShortName: string;
  loginSubtitle: string;
  loginTagline: string;
  footerText: string;
  /** Hex color (#RRGGBB) — frontend derives the rest of the palette
   *  from this and applies it as CSS-variable overrides at runtime. */
  primaryColor: string;
  /** Stable URL the frontend can <img src=…> at. null when no logo uploaded. */
  logoUrl: string | null;
  /** Updated-at of the logo, used as a cache buster on the URL. */
  logoUpdatedAt: string | null;
};

@Injectable()
export class BrandingService {
  constructor(
    @InjectRepository(BrandingAssetEntity)
    private readonly assets: Repository<BrandingAssetEntity>,
    @InjectRepository(SystemSettingEntity)
    private readonly settings: Repository<SystemSettingEntity>,
  ) {}

  /** Read the public branding payload — text settings + logo URL. */
  async getPublic(): Promise<BrandingDto> {
    const rows = await this.settings.find({
      where: TEXT_KEYS.map((k) => ({ key: KEY_MAP[k] })),
    });
    const byKey = new Map(rows.map((r) => [r.key, r.value]));

    const text = {} as Record<TextKey, string>;
    for (const k of TEXT_KEYS) {
      const raw = byKey.get(KEY_MAP[k]);
      text[k] = typeof raw === 'string' && raw.trim() ? raw : DEFAULTS[k];
    }

    const logo = await this.assets.findOne({ where: { kind: 'logo' } });

    return {
      ...text,
      // Cache-bust by appending updated_at to the URL — clients fetch the
      // latest after an admin uploads a replacement.
      logoUrl: logo ? `/api/branding/logo?v=${logo.updatedAt.getTime()}` : null,
      logoUpdatedAt: logo ? logo.updatedAt.toISOString() : null,
    };
  }

  /** Read the raw logo bytes for the public stream endpoint. */
  async getLogo(): Promise<{ bytes: Buffer; mime: string; updatedAt: Date } | null> {
    const logo = await this.assets.findOne({ where: { kind: 'logo' } });
    if (!logo) return null;
    return { bytes: Buffer.from(logo.bytes), mime: logo.mime, updatedAt: logo.updatedAt };
  }

  /** Replace the uploaded logo. Sniffs the bytes; refuses anything other
   *  than PNG/JPEG/WebP/SVG. */
  async setLogo(file: Express.Multer.File, actorId: string): Promise<void> {
    if (!file || !file.buffer?.length) {
      throw new BadRequestException({ code: 'EMPTY_FILE' });
    }
    if (file.size > MAX_LOGO_BYTES) {
      throw new PayloadTooLargeException({ code: 'LOGO_TOO_LARGE', maxBytes: MAX_LOGO_BYTES });
    }
    // SVG isn't sniffable from magic bytes (it's text); accept the
    // declared type when the body looks like XML/SVG. Everything else
    // must clear the magic-byte sniffer.
    let mime: string | null = null;
    const declared = (file.mimetype || '').toLowerCase();
    if (declared === 'image/svg+xml') {
      const head = file.buffer.subarray(0, 200).toString('utf8').trim().toLowerCase();
      if (head.startsWith('<?xml') || head.startsWith('<svg')) {
        mime = 'image/svg+xml';
      }
    } else {
      mime = await sniffMime(file.buffer);
    }
    if (!mime || !ALLOWED_LOGO_MIMES.has(mime)) {
      throw new BadRequestException({
        code: 'BAD_LOGO_MIME',
        allowed: [...ALLOWED_LOGO_MIMES],
        sniffed: mime,
      });
    }

    const existing = await this.assets.findOne({ where: { kind: 'logo' } });
    const row = existing ?? this.assets.create({ kind: 'logo' });
    row.mime = mime;
    row.bytes = file.buffer;
    row.sizeBytes = file.size;
    row.updatedBy = actorId;
    await this.assets.save(row);
  }

  async deleteLogo(): Promise<void> {
    await this.assets.delete({ kind: 'logo' });
  }

  /**
   * Update branding text settings. Body is the camelCase shape used by the
   * frontend; we translate to dotted keys before writing through the
   * standard system_settings table so existing audit + GET-all tooling
   * keeps working.
   *
   * Empty strings clear back to defaults (the public GET falls back when
   * the stored value is blank).
   */
  async updateText(
    patch: Partial<Record<TextKey, string>>,
    actorId: string,
  ): Promise<void> {
    for (const k of TEXT_KEYS) {
      const v = patch[k];
      if (v === undefined) continue;
      const dbKey = KEY_MAP[k];
      const row =
        (await this.settings.findOne({ where: { key: dbKey } })) ??
        this.settings.create({ key: dbKey });
      row.value = String(v);
      row.updatedBy = actorId;
      await this.settings.save(row);
    }
  }
}
