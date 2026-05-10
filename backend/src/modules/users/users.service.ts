import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
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
import { TwoFactorService } from '../auth/two-factor.service';
import { AuthAuditService } from '../auth-audit/auth-audit.service';
import { AuthCallContext } from '../auth/auth-provider.interface';
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
    @Optional() private readonly auditor?: AuthAuditService,
    @Optional() private readonly twoFactor?: TwoFactorService,
  ) {
    this.bcryptRounds = cfg.get<AppConfig>('app')!.bcryptRounds;
  }

  async list(
    page = 1,
    pageSize = 25,
    filters: { departmentId?: string; isActive?: boolean } = {},
  ): Promise<[UserEntity[], number]> {
    const qb = this.users.createQueryBuilder('u').orderBy('u.created_at', 'DESC');
    if (filters.isActive !== undefined) {
      qb.andWhere('u.is_active = :isActive', { isActive: filters.isActive });
    }
    // Filter to active members of a target department — used by the
    // assignment dialog's cascade picker so callers can only pick assignees
    // who actually belong to the chosen department.
    if (filters.departmentId) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM user_departments ud WHERE ud.user_id = u.id AND ud.department_id = :dept AND ud.is_active = TRUE)',
        { dept: filters.departmentId },
      );
    }
    qb.skip((page - 1) * pageSize).take(pageSize);
    return qb.getManyAndCount();
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
        // Run inside the same transaction — the user row above isn't
        // committed yet, so a separate connection's FK check would fail.
        await this.permissions.setUserRoles(created.id, dto.roleIds, actorId, em);
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

  /**
   * Clear a user's failed-login counter and lock-until timestamp. Idempotent
   * — if the user is not currently locked and has zero failures, returns
   * `{ unlocked: false }` without writing an audit row, so a curious admin
   * clicking the button on a healthy account doesn't generate noise.
   *
   * Always emits `account.unlocked_by_admin` when there was something to
   * clear, with the previous lock state captured in `detail` for the
   * Login Activity drill-down.
   */
  async unlock(
    id: string,
    actorId: string | null,
    ctx: AuthCallContext = {},
  ): Promise<{ unlocked: boolean; lockedUntil: Date | null; failedLoginCount: number }> {
    const user = await this.findById(id);
    const wasLocked = !!user.lockedUntil || user.failedLoginCount > 0;
    if (!wasLocked) {
      return { unlocked: false, lockedUntil: null, failedLoginCount: 0 };
    }

    const previousLockedUntil = user.lockedUntil;
    const previousFailedCount = user.failedLoginCount;
    await this.users.update(
      { id: user.id },
      { failedLoginCount: 0, lockedUntil: null },
    );

    await this.auditor?.record({
      username: user.username,
      userId: user.id,
      event: 'account.unlocked_by_admin',
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      detail: {
        actorId,
        previousLockedUntil: previousLockedUntil ? previousLockedUntil.toISOString() : null,
        previousFailedLoginCount: previousFailedCount,
      },
    });

    return { unlocked: true, lockedUntil: null, failedLoginCount: 0 };
  }

  /**
   * Admin-initiated 2FA reset. Clears the target user's TOTP secret +
   * all backup codes, force-revokes their refresh tokens (so any open
   * sessions get bounced to the login page), and audits the action
   * with the actor's id in `detail`.
   *
   * Idempotent — calling on a user who never enrolled returns
   * `{ wasEnrolled: false }` and writes no audit row, so a curious
   * admin clicking the button on the wrong user doesn't generate noise.
   */
  async resetTwoFactor(
    id: string,
    actorId: string | null,
    ctx: AuthCallContext = {},
  ): Promise<{ wasEnrolled: boolean }> {
    const user = await this.findById(id);
    if (!user.totpEnrolledAt) {
      return { wasEnrolled: false };
    }
    if (!this.twoFactor) {
      // Should never happen — TwoFactorService is in the global AuthModule
      // and unused only in tests. Fail loud rather than silently.
      throw new Error('TwoFactorService not available');
    }
    await this.twoFactor.clear(user.id);
    await this.refreshTokens.revokeAllForUser(user.id);
    await this.auditor?.record({
      username: user.username,
      userId: user.id,
      event: '2fa.reset_by_admin',
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      detail: { actorId },
    });
    return { wasEnrolled: true };
  }
}
