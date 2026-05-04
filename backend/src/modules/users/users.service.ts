import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UserEntity } from '../auth/entities/user.entity';
import { PermissionsService } from '../permissions/permissions.service';
import { RefreshTokenService } from '../auth/refresh-token.service';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './dto/create-user.dto';
import { AppConfig } from '../../config/configuration';

@Injectable()
export class UsersService {
  private readonly bcryptRounds: number;

  constructor(
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    private readonly permissions: PermissionsService,
    private readonly refreshTokens: RefreshTokenService,
    cfg: ConfigService,
  ) {
    this.bcryptRounds = cfg.get<AppConfig>('app')!.bcryptRounds;
  }

  list(page = 1, pageSize = 25) {
    return this.users.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  }

  async findById(id: string): Promise<UserEntity> {
    const u = await this.users.findOne({ where: { id } });
    if (!u) throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    return u;
  }

  async create(dto: CreateUserDto, actorId: string | null): Promise<UserEntity> {
    if (await this.users.findOne({ where: { username: dto.username } })) {
      throw new ConflictException({ code: 'USERNAME_TAKEN' });
    }
    if (dto.email && (await this.users.findOne({ where: { email: dto.email } }))) {
      throw new ConflictException({ code: 'EMAIL_TAKEN' });
    }
    if (dto.password.length < 10) throw new BadRequestException({ code: 'PASSWORD_TOO_SHORT' });

    const passwordHash = await bcrypt.hash(dto.password, this.bcryptRounds);
    const created = await this.users.save(
      this.users.create({
        username: dto.username,
        displayName: dto.displayName,
        email: dto.email ?? null,
        passwordHash,
        isActive: dto.isActive ?? true,
        authProvider: 'local',
      }),
    );
    if (dto.roleIds?.length) {
      await this.permissions.setUserRoles(created.id, dto.roleIds, actorId);
    }
    return created;
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserEntity> {
    const user = await this.findById(id);
    if (dto.email && dto.email !== user.email) {
      const taken = await this.users.findOne({ where: { email: dto.email } });
      if (taken && taken.id !== user.id) throw new ConflictException({ code: 'EMAIL_TAKEN' });
    }
    Object.assign(user, dto);
    const saved = await this.users.save(user);
    if (dto.isActive === false) {
      await this.refreshTokens.revokeAllForUser(user.id);
    }
    return saved;
  }

  async setRoles(id: string, roleIds: string[], actorId: string | null): Promise<void> {
    await this.findById(id);
    await this.permissions.setUserRoles(id, roleIds, actorId);
    // Force re-login so the new permission set takes effect immediately.
    await this.refreshTokens.revokeAllForUser(id);
  }

  async resetPassword(id: string, dto: ResetPasswordDto): Promise<void> {
    const user = await this.findById(id);
    const newHash = await bcrypt.hash(dto.newPassword, this.bcryptRounds);
    await this.users.update({ id: user.id }, { passwordHash: newHash });
    await this.refreshTokens.revokeAllForUser(user.id);
  }
}
