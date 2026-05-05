import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UserEntity } from '../auth/entities/user.entity';
import { UserDepartmentEntity } from '../auth/entities/user-department.entity';
import { DepartmentEntity } from '../departments/entities/department.entity';
import { PermissionsService } from '../permissions/permissions.service';
import { RefreshTokenService } from '../auth/refresh-token.service';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './dto/create-user.dto';
import { AppConfig } from '../../config/configuration';

@Injectable()
export class UsersService {
  private readonly bcryptRounds: number;

  constructor(
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(UserDepartmentEntity)
    private readonly memberships: Repository<UserDepartmentEntity>,
    @InjectRepository(DepartmentEntity)
    private readonly departments: Repository<DepartmentEntity>,
    private readonly permissions: PermissionsService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly dataSource: DataSource,
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

  /** Batch-load active department memberships for a set of users.
   *  Used by the admin user list to display each user's departments without
   *  N+1 querying. */
  async listMembershipsByUser(userIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (userIds.length === 0) return map;
    const rows = await this.memberships.find({
      where: { userId: In(userIds), isActive: true },
    });
    for (const r of rows) {
      const key = String(r.userId);
      const list = map.get(key) ?? [];
      list.push(String(r.departmentId));
      map.set(key, list);
    }
    return map;
  }

  /** Convenience for single-record callers. */
  async getMemberships(userId: string): Promise<string[]> {
    const rows = await this.memberships.find({ where: { userId, isActive: true } });
    return rows.map((r) => String(r.departmentId));
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

    // Resolve membership set + primary. Primary must be one of the
    // memberships (matches the DB trigger). When only `departmentId` is sent
    // (legacy single-dept callers), it implies a single-element membership.
    const { departmentIds, primary } = await this.resolveDeptInputs(
      dto.departmentIds,
      dto.departmentId ?? null,
      [],
    );

    const passwordHash = await bcrypt.hash(dto.password, this.bcryptRounds);
    return this.dataSource.transaction(async (em) => {
      // Memberships must exist *before* we set the primary, otherwise the
      // BEFORE-INSERT trigger rejects the user row.
      const created = await em.getRepository(UserEntity).save(
        em.getRepository(UserEntity).create({
          username: dto.username,
          displayName: dto.displayName,
          email: dto.email ?? null,
          passwordHash,
          isActive: dto.isActive ?? true,
          authProvider: 'local',
          departmentId: null, // set below after memberships land
        }),
      );
      await this.writeMemberships(em, created.id, departmentIds);
      if (primary) {
        await em.getRepository(UserEntity).update({ id: created.id }, { departmentId: primary });
        created.departmentId = primary;
      }
      if (dto.roleIds?.length) {
        await this.permissions.setUserRoles(created.id, dto.roleIds, actorId);
      }
      return created;
    });
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserEntity> {
    const user = await this.findById(id);
    if (dto.email && dto.email !== user.email) {
      const taken = await this.users.findOne({ where: { email: dto.email } });
      if (taken && taken.id !== user.id) throw new ConflictException({ code: 'EMAIL_TAKEN' });
    }

    // Membership replacement + primary must move together so the trigger
    // always sees a consistent state.
    const willTouchMembership = dto.departmentIds !== undefined || dto.departmentId !== undefined;
    let resolved: { departmentIds: string[]; primary: string | null } | null = null;
    if (willTouchMembership) {
      const current = (await this.memberships.find({ where: { userId: user.id, isActive: true } }))
        .map((m) => String(m.departmentId));
      resolved = await this.resolveDeptInputs(
        dto.departmentIds,
        dto.departmentId === undefined ? user.departmentId : dto.departmentId,
        current,
      );
    }

    return this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(UserEntity);
      // Apply scalar fields first — but clear primary before touching
      // memberships to avoid the trigger tripping on a stale primary.
      const scalarPatch: Partial<UserEntity> = {};
      if (dto.displayName !== undefined) scalarPatch.displayName = dto.displayName;
      if (dto.email !== undefined) scalarPatch.email = dto.email ?? null;
      if (dto.isActive !== undefined) scalarPatch.isActive = dto.isActive;

      if (resolved) {
        // Step 1: drop primary so we can rewrite memberships freely.
        await repo.update({ id: user.id }, { ...scalarPatch, departmentId: null });
        await this.writeMemberships(em, user.id, resolved.departmentIds);
        // Step 2: set the (validated) new primary.
        await repo.update({ id: user.id }, { departmentId: resolved.primary });
      } else if (Object.keys(scalarPatch).length > 0) {
        await repo.update({ id: user.id }, scalarPatch);
      }

      if (dto.isActive === false) {
        await this.refreshTokens.revokeAllForUser(user.id);
      }
      return this.users.findOneOrFail({ where: { id: user.id } });
    });
  }

  /** Replace the user's active department memberships in-place.
   *  Existing rows for departments still in the new set are kept (preserves
   *  created_at); rows not in the set are deactivated rather than deleted, so
   *  audit trails referencing them stay intact. */
  private async writeMemberships(
    em: EntityManager,
    userId: string,
    departmentIds: string[],
  ): Promise<void> {
    const repo = em.getRepository(UserDepartmentEntity);
    // Activate (or insert) the rows we want.
    if (departmentIds.length > 0) {
      const existing = await repo.find({ where: { userId } });
      const existingByDept = new Map(existing.map((r) => [String(r.departmentId), r]));
      for (const d of departmentIds) {
        if (existingByDept.has(d)) {
          await repo.update({ userId, departmentId: d }, { isActive: true });
        } else {
          await repo.insert({ userId, departmentId: d, isActive: true });
        }
      }
    }
    // Deactivate rows for departments no longer in the set.
    const allActive = await repo.find({ where: { userId, isActive: true } });
    const stale = allActive
      .map((r) => String(r.departmentId))
      .filter((d) => !departmentIds.includes(d));
    if (stale.length > 0) {
      await repo.update({ userId, departmentId: In(stale) }, { isActive: false });
    }
  }

  /** Reconcile departmentIds[] + departmentId into a clean (memberships, primary) pair.
   *  - departmentIds undefined  → keep current memberships
   *  - departmentIds [] / null  → user belongs to no departments (admin-style)
   *  - primary must be a member, else BAD_PRIMARY_DEPT (or auto-pick first member)
   *  - departments must all exist + be active, else BAD_DEPARTMENT */
  private async resolveDeptInputs(
    departmentIds: string[] | undefined,
    primaryArg: string | null | undefined,
    currentMemberships: string[],
  ): Promise<{ departmentIds: string[]; primary: string | null }> {
    const memberships =
      departmentIds === undefined ? currentMemberships : Array.from(new Set(departmentIds));

    if (memberships.length > 0) {
      const known = await this.departments.find({ where: { id: In(memberships) } });
      const knownIds = new Set(known.filter((d) => d.isActive).map((d) => String(d.id)));
      const missing = memberships.filter((d) => !knownIds.has(d));
      if (missing.length > 0) {
        throw new BadRequestException({ code: 'BAD_DEPARTMENT', ids: missing });
      }
    }

    let primary: string | null;
    if (primaryArg === null) {
      primary = null;
    } else if (primaryArg === undefined) {
      // No explicit primary — auto-pick first membership for usability.
      primary = memberships[0] ?? null;
    } else {
      if (!memberships.includes(primaryArg)) {
        throw new BadRequestException({ code: 'PRIMARY_NOT_MEMBER', primaryDepartmentId: primaryArg });
      }
      primary = primaryArg;
    }
    return { departmentIds: memberships, primary };
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
