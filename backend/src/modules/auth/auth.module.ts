import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { UserEntity } from './entities/user.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { LocalAuthProvider } from './local-auth.provider';
import { AuthProviderRegistry } from './auth-provider.registry';
import { RefreshTokenService } from './refresh-token.service';
import { PermissionsModule } from '../permissions/permissions.module';
import { AppConfig } from '../../config/configuration';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, RefreshTokenEntity]),
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
  controllers: [AuthController],
  providers: [
    AuthService,
    LocalAuthProvider,
    AuthProviderRegistry,
    RefreshTokenService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [AuthService, RefreshTokenService, TypeOrmModule, JwtModule],
})
export class AuthModule {}
