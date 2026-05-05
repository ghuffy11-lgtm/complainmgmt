import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuthProviderRegistry } from './auth-provider.registry';
import { RefreshTokenService } from './refresh-token.service';
import { UserEntity } from './entities/user.entity';
import { PermissionsService } from '../permissions/permissions.service';
import { AuthUser } from './auth-user.type';
import { AppConfig } from '../../config/configuration';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

type AccessTokenClaims = {
  sub: string;
  username: string;
  roleKeys: string[];
};

@Injectable()
export class AuthService {
  private readonly accessTtl: number;
  private readonly bcryptRounds: number;

  constructor(
    private readonly providers: AuthProviderRegistry,
    private readonly jwt: JwtService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly permissions: PermissionsService,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    cfg: ConfigService,
  ) {
    const app = cfg.get<AppConfig>('app')!;
    this.accessTtl = app.jwt.accessTtl;
    this.bcryptRounds = app.bcryptRounds;
  }

  async login(dto: LoginDto, ctx: { ip?: string; userAgent?: string }) {
    const { user } = await this.providers.tryAuthenticate(dto.username, dto.password);
    const authUser = await this.permissions.materialize(user);
    const accessToken = await this.signAccess(authUser);
    const refreshToken = await this.refreshTokens.issue(user.id, ctx);
    return { accessToken, refreshToken, user: this.toMeDto(authUser) };
  }

  async refresh(rawRefresh: string, ctx: { ip?: string; userAgent?: string }) {
    const { userId, raw: newRefresh } = await this.refreshTokens.rotate(rawRefresh, ctx);
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user || !user.isActive) throw new UnauthorizedException({ code: 'USER_DISABLED' });
    const authUser = await this.permissions.materialize(user);
    return {
      accessToken: await this.signAccess(authUser),
      refreshToken: newRefresh,
    };
  }

  async logout(rawRefresh: string): Promise<void> {
    await this.refreshTokens.revoke(rawRefresh);
  }

  async verifyAccessToken(token: string): Promise<AuthUser> {
    const claims = await this.jwt.verifyAsync<AccessTokenClaims>(token);
    const user = await this.users.findOne({ where: { id: claims.sub } });
    if (!user || !user.isActive) throw new UnauthorizedException({ code: 'USER_DISABLED' });
    return this.permissions.materialize(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    if (dto.newPassword.length < 10) {
      throw new BadRequestException({ code: 'PASSWORD_TOO_SHORT' });
    }
    const newHash = await bcrypt.hash(dto.newPassword, this.bcryptRounds);
    await this.users.update({ id: user.id }, { passwordHash: newHash });
    await this.refreshTokens.revokeAllForUser(user.id);
  }

  toMeDto(u: AuthUser) {
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      departmentId: u.departmentId,
      roleKeys: u.roleKeys,
      permissions: Array.from(u.permissions),
    };
  }

  private signAccess(u: AuthUser): Promise<string> {
    const payload: AccessTokenClaims = {
      sub: String(u.id),
      username: u.username,
      roleKeys: u.roleKeys,
    };
    return this.jwt.signAsync(payload, { expiresIn: this.accessTtl });
  }
}
