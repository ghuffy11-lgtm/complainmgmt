import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthAuditLogEntity } from './entities/auth-audit-log.entity';
import { AuthAuditService } from './auth-audit.service';
import { AuthAuditController } from './auth-audit.controller';
import { AuthAuditRetentionService } from './auth-audit-retention.service';
import { SystemSettingEntity } from '../admin/system-settings.entity';

/**
 * Records authentication events (login success/failure, lockout, 2FA
 * lifecycle, admin actions on user accounts) into `auth_audit_log`.
 *
 * Global because both AuthModule (login flow) and AdminModule
 * (unlock-user, reset-2fa) need to call it without circular imports.
 *
 * Read access lives at GET /admin/auth-audit, gated by `auth_audit:read`.
 * Nightly retention pruning is provided by AuthAuditRetentionService
 * (window read from `auth_audit.retention_days` in system_settings).
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuthAuditLogEntity, SystemSettingEntity])],
  providers: [AuthAuditService, AuthAuditRetentionService],
  controllers: [AuthAuditController],
  exports: [AuthAuditService],
})
export class AuthAuditModule {}
