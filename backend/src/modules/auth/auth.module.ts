import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { UserEntity } from './entities/user.entity';
import { UserDepartmentEntity } from './entities/user-department.entity';
import { UserBackupCodeEntity } from './entities/user-backup-code.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { SystemSettingEntity } from '../admin/system-settings.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TwoFactorController } from './two-factor.controller';
import { TwoFactorService } from './two-factor.service';
import { LockoutPolicy } from './lockout-policy.service';
import { SecretCipher } from './crypto/secret-cipher';
import { LocalAuthProvider } from './local-auth.provider';
import { AuthProviderRegistry } from './auth-provider.registry';
import { RefreshTokenService } from './refresh-token.service';
import { PermissionsModule } from '../permissions/permissions.module';
import { AppConfig } from '../../config/configuration';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TwoFactorRequiredGuard } from '../../common/guards/two-factor-required.guard';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      UserDepartmentEntity,
      UserBackupCodeEntity,
      RefreshTokenEntity,
      SystemSettingEntity,
    ]),
    PermissionsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const app = cfg.get<AppConfig>('app')!;
        return { secret: app.jwt.secret, signOptions: { expiresIn: app.jwt.accessTtl } };
      },
    }),
  ],
  controllers: [AuthController, TwoFactorController],
  providers: [
    AuthService,
    LocalAuthProvider,
    AuthProviderRegistry,
    RefreshTokenService,
    SecretCipher,
    TwoFactorService,
    LockoutPolicy,
    // Order matters: APP_GUARD providers run in declaration order. The
    // JWT guard populates req.user, then the 2FA-required guard reads
    // it, then PermissionsGuard checks the resolved permissions.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TwoFactorRequiredGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [AuthService, RefreshTokenService, TwoFactorService, LockoutPolicy, TypeOrmModule, JwtModule],
})
export class AuthModule {}
