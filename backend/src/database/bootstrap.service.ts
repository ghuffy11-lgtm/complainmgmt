import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UserEntity } from '../modules/auth/entities/user.entity';
import { RoleEntity } from '../modules/permissions/entities/role.entity';
import { UserRoleEntity } from '../modules/permissions/entities/user-role.entity';
import { AppConfig } from '../config/configuration';

/**
 * On-boot bootstrap of the initial admin user.
 *
 * Only runs when both `INITIAL_ADMIN_USERNAME` and `INITIAL_ADMIN_PASSWORD`
 * are present in env AND the user does not already exist. Idempotent — safe
 * to leave the env vars set across restarts (the deployment guide
 * recommends unsetting them after first login as a hardening step).
 */
@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly log = new Logger('Bootstrap');

  constructor(
    private readonly cfg: ConfigService,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(RoleEntity) private readonly roles: Repository<RoleEntity>,
    @InjectRepository(UserRoleEntity) private readonly userRoles: Repository<UserRoleEntity>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const app = this.cfg.get<AppConfig>('app')!;
    const seed = app.initialAdmin;
    if (!seed) return;

    const exists = await this.users.findOne({ where: { username: seed.username } });
    if (exists) {
      this.log.log(`Initial admin "${seed.username}" already exists; skipping bootstrap.`);
      return;
    }

    const adminRole = await this.roles.findOne({ where: { key: 'admin' } });
    if (!adminRole) {
      this.log.error(`Cannot bootstrap admin: no role with key 'admin' (did seed migration run?).`);
      return;
    }

    const hash = await bcrypt.hash(seed.password, app.bcryptRounds);
    const user = await this.users.save(
      this.users.create({
        username: seed.username,
        displayName: seed.displayName,
        passwordHash: hash,
        authProvider: 'local',
        isActive: true,
      }),
    );
    await this.userRoles.insert({ userId: user.id, roleId: adminRole.id });
    this.log.warn(
      `Bootstrapped initial admin "${seed.username}" — change the password and unset INITIAL_ADMIN_* now.`,
    );
  }
}
