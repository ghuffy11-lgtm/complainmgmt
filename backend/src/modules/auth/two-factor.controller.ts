import {
  Body,
  ConflictException,
  Controller,
  HttpCode,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from './auth.service';
import { TwoFactorService } from './two-factor.service';
import { UserEntity } from './entities/user.entity';
import { AuthAuditService } from '../auth-audit/auth-audit.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from './auth-user.type';
import {
  DisableTwoFactorDto,
  EnableTwoFactorDto,
  VerifyTwoFactorDto,
} from './dto/two-factor.dto';

@Controller('auth/2fa')
@UseGuards(JwtAuthGuard)
export class TwoFactorController {
  constructor(
    private readonly auth: AuthService,
    private readonly twoFactor: TwoFactorService,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    private readonly auditor: AuthAuditService,
  ) {}

  private static ctx(req: Request) {
    return {
      ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip,
      userAgent: req.headers['user-agent'],
    };
  }

  /**
   * Generate a fresh provisional secret and QR code. Does not persist
   * the secret — that only happens on /enable. Authenticated; the
   * caller is the user enrolling. Calling this when already enrolled
   * conflicts (use /disable first).
   */
  @Post('setup')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async setup(@CurrentUser() actor: AuthUser) {
    if (!this.twoFactor.isConfigured()) {
      throw new ServiceUnavailableException({ code: 'TOTP_NOT_CONFIGURED' });
    }
    const user = await this.users.findOneOrFail({ where: { id: String(actor.id) } });
    if (this.twoFactor.isEnrolled(user)) {
      throw new ConflictException({ code: '2FA_ALREADY_ENROLLED' });
    }
    return this.twoFactor.setup(user);
  }

  /**
   * Confirm enrollment by verifying the first 6-digit code against
   * the provisional secret. On success, persist the encrypted secret +
   * generate 10 backup codes, returned ONCE in plaintext.
   */
  @Post('enable')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async enable(
    @CurrentUser() actor: AuthUser,
    @Body() dto: EnableTwoFactorDto,
    @Req() req: Request,
  ) {
    if (!this.twoFactor.isConfigured()) {
      throw new ServiceUnavailableException({ code: 'TOTP_NOT_CONFIGURED' });
    }
    const user = await this.users.findOneOrFail({ where: { id: String(actor.id) } });
    if (this.twoFactor.isEnrolled(user)) {
      throw new ConflictException({ code: '2FA_ALREADY_ENROLLED' });
    }
    let result;
    try {
      result = await this.twoFactor.enable(user.id, dto.provisionalSecret, dto.code);
    } catch (err) {
      const e = err as { code?: string };
      if (e.code === '2FA_CODE_INVALID') {
        throw new UnauthorizedException({ code: '2FA_CODE_INVALID' });
      }
      throw err;
    }
    const ctx = TwoFactorController.ctx(req);
    await this.auditor.record({
      username: user.username,
      userId: user.id,
      event: '2fa.enrolled',
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return { enrolled: true, backupCodes: result.backupCodes };
  }

  /**
   * Second leg of the login flow. Public — the only credential is the
   * challenge token (signed JWT, single-use, 5-min TTL, distinct
   * audience). Tighter throttle since this is the brute-force path
   * for the 6-digit code.
   */
  @Public()
  @Post('verify')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async verify(@Body() dto: VerifyTwoFactorDto, @Req() req: Request) {
    return this.auth.completeTwoFactor(
      dto.challengeToken,
      dto.code,
      TwoFactorController.ctx(req),
    );
  }

  /** Disable 2FA on the caller's own account. Requires the current
   *  password as a re-assertion. Force-logs-out all sessions. */
  @Post('disable')
  @HttpCode(204)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async disable(
    @CurrentUser() actor: AuthUser,
    @Body() dto: DisableTwoFactorDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.auth.disableTwoFactor(
      String(actor.id),
      dto.currentPassword,
      TwoFactorController.ctx(req),
    );
  }
}
