import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  ComplaintEntity,
  ComplaintPriority,
  ComplaintStatus,
} from './entities/complaint.entity';
import { ComplaintFieldValueEntity } from './entities/complaint-field-value.entity';
import { DynamicFieldsService } from '../dynamic-fields/dynamic-fields.service';
import { CoercedValue, validateValues } from '../dynamic-fields/validate-values';
import { DynamicFieldEntity } from '../dynamic-fields/entities/dynamic-field.entity';
import { AuthUser } from '../auth/auth-user.type';
import { AuditService } from '../audit/audit.service';
import { LockingService } from './locking.service';
import { ReferenceNumberService } from './reference-number.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { SubcategoriesService } from '../subcategories/subcategories.service';
import { OriginsService } from '../origins/origins.service';
import { hasPermission } from '../permissions/permission-resolver';
import { CreateComplaintDto, UpdateComplaintDto } from './dto/complaint.dto';
import { assertEditable, classifyStatusTransition } from './complaint-freeze';

type ListFilters = {
  page: number;
  pageSize: number;
  status?: ComplaintStatus;
  priority?: ComplaintPriority;
  assignedTo?: string;
  departmentId?: string;
  /** Origin filter. `'none'` matches legacy rows where origin_id IS NULL. */
  originId?: string;
  subcategoryId?: string;
  q?: string;
  /** Inclusive lower bound on complaint_date (YYYY-MM-DD). */
  dateFrom?: string;
  /** Inclusive upper bound on complaint_date (YYYY-MM-DD). */
  dateTo?: string;
  /**
   * Dynamic field-value filters keyed by field key. Only fields with
   * `is_searchable=true` are accepted; others raise BAD_FIELD_FILTER.
   */
  fv?: Record<string, string>;
};

@Injectable()
export class ComplaintsService {
  constructor(
    @InjectRepository(ComplaintEntity) private readonly complaints: Repository<ComplaintEntity>,
    @InjectRepository(ComplaintFieldValueEntity) private readonly fieldValues: Repository<ComplaintFieldValueEntity>,
    private readonly dataSource: DataSource,
    private readonly fields: DynamicFieldsService,
    private readonly audit: AuditService,
    private readonly locking: LockingService,
    private readonly refs: ReferenceNumberService,
    private readonly assignments: AssignmentsService,
    private readonly subcategories: SubcategoriesService,
    private readonly origins: OriginsService,
  ) {}

  // ─── classification validation ─────────────────────────────────────────
  // Returns `{ subcategoryId, originId }` after enforcing:
  //   • origin must be provided + active
  //   • when dept has ≥1 active subcat → subcategoryId required + must
  //     belong to that dept and be active
  //   • when dept has 0 active subcats → subcategoryId must not be supplied
  private async validateClassification(input: {
    departmentId: string;
    subcategoryId?: string | null;
    originId?: string;
  }): Promise<{ subcategoryId: string | null; originId: string }> {
    if (!input.originId) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        errors: { origin: ['REQUIRED'] },
      });
    }
    const origin = await this.origins.findActive(input.originId);
    if (!origin) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        errors: { origin: ['NOT_ACTIVE'] },
      });
    }

    const deptHasSubcats = await this.subcategories.hasActive(input.departmentId);
    if (deptHasSubcats) {
      if (!input.subcategoryId) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          errors: { subcategory: ['REQUIRED'] },
        });
      }
      const sub = await this.subcategories.findActiveForDepartment(
        input.subcategoryId,
        input.departmentId,
      );
      if (!sub) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          errors: { subcategory: ['DEPT_MISMATCH_OR_INACTIVE'] },
        });
      }
      return { subcategoryId: sub.id, originId: origin.id };
    }

    if (input.subcategoryId) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        errors: { subcategory: ['NOT_ALLOWED'] },
      });
    }
    return { subcategoryId: null, originId: origin.id };
  }

  // ─── visibility scope ──────────────────────────────────────────────────
  // `complaint:read` (admin / manager) sees everything. Otherwise the
  // caller must hold `complaint.own:read`, which narrows visibility to
  // complaints assigned to one of their active departments OR complaints
  // they created themselves (decision: creator-always-sees).

  private hasFullRead(actor: AuthUser): boolean {
    return actor.permissions.has('complaint:read');
  }

  private applyVisibilityScope(
    qb: ReturnType<Repository<ComplaintEntity>['createQueryBuilder']>,
    actor: AuthUser,
  ): void {
    if (this.hasFullRead(actor)) return;
    const deptIds = actor.departmentIds ?? [];
    if (deptIds.length > 0) {
      qb.andWhere(
        '(c.assigned_department_id IN (:...scopeDepts) OR c.created_by = :scopeMe)',
        { scopeDepts: deptIds, scopeMe: String(actor.id) },
      );
    } else {
      // Scoped user with zero memberships → only their own creations.
      qb.andWhere('c.created_by = :scopeMe', { scopeMe: String(actor.id) });
    }
  }

  /** Detail-page guard: 404 (not 403) for cross-dept reads to avoid leaking
   *  existence of complaints in other departments. */
  private assertVisible(complaint: ComplaintEntity, actor: AuthUser): void {
    if (this.hasFullRead(actor)) return;
    const deptIds = actor.departmentIds ?? [];
    const inDept =
      complaint.assignedDepartmentId != null &&
      deptIds.includes(String(complaint.assignedDepartmentId));
    const isCreator = String(complaint.createdBy) === String(actor.id);
    if (!inDept && !isCreator) {
      throw new NotFoundException({ code: 'COMPLAINT_NOT_FOUND' });
    }
  }

  async list(filters: ListFilters, actor: AuthUser) {
    const qb = this.complaints.createQueryBuilder('c').orderBy('c.created_at', 'DESC');
    this.applyVisibilityScope(qb, actor);
    if (filters.status) qb.andWhere('c.status = :status', { status: filters.status });
    if (filters.priority) qb.andWhere('c.priority = :priority', { priority: filters.priority });
    if (filters.assignedTo) qb.andWhere('c.assigned_to = :assignedTo', { assignedTo: filters.assignedTo });
    if (filters.departmentId) qb.andWhere('c.assigned_department_id = :dept', { dept: filters.departmentId });
    if (filters.originId === 'none') {
      qb.andWhere('c.origin_id IS NULL');
    } else if (filters.originId) {
      qb.andWhere('c.origin_id = :originId', { originId: filters.originId });
    }
    if (filters.subcategoryId) {
      qb.andWhere('c.subcategory_id = :subcategoryId', { subcategoryId: filters.subcategoryId });
    }
    if (filters.q) qb.andWhere('c.reference_no ILIKE :q', { q: `%${filters.q}%` });
    if (filters.dateFrom) qb.andWhere('c.complaint_date >= :dateFrom', { dateFrom: filters.dateFrom });
    if (filters.dateTo) qb.andWhere('c.complaint_date <= :dateTo', { dateTo: filters.dateTo });

    // ─── dynamic field-value filters (?fv[<key>]=<value>) ──────────────
    // EXISTS subquery per filter — keeps the main row set 1-row-per-complaint
    // (no DISTINCT needed) and works through getManyAndCount's count path,
    // which the raw-table innerJoin variant does not. Only is_searchable +
    // active fields are accepted; everything else is BAD_FIELD_FILTER.
    const fv = filters.fv ?? {};
    const fvEntries = Object.entries(fv).filter(([, v]) => typeof v === 'string' && v.trim() !== '');
    if (fvEntries.length > 0) {
      const schemaByKey = await this.fields.fullSchemaMap();
      let idx = 0;
      for (const [key, rawValue] of fvEntries) {
        const field = schemaByKey.get(key);
        if (!field || !field.isActive || !field.isSearchable) {
          throw new BadRequestException({ code: 'BAD_FIELD_FILTER', key });
        }
        const i = idx++;
        const fidParam = `fv${i}_fid`;
        const vParam = `fv${i}_v`;
        const value = rawValue.trim();

        let valueClause: string;
        let valueParam: Record<string, unknown>;
        switch (field.type) {
          case 'text':
            valueClause = `cfv.value_text ILIKE :${vParam}`;
            valueParam = { [vParam]: `%${value}%` };
            break;
          case 'number':
            // Numeric column cast to text for substring match — operators
            // typically search "555" expecting partial-number matches.
            valueClause = `cfv.value_number::text ILIKE :${vParam}`;
            valueParam = { [vParam]: `%${value}%` };
            break;
          case 'dropdown':
            valueClause = `cfv.value_option_id = :${vParam}`;
            valueParam = { [vParam]: value };
            break;
          default:
            throw new BadRequestException({ code: 'UNSEARCHABLE_FIELD_TYPE', key, type: field.type });
        }

        qb.andWhere(
          `EXISTS (
             SELECT 1 FROM complaint_field_values cfv
              WHERE cfv.complaint_id = c.id
                AND cfv.field_id = :${fidParam}
                AND ${valueClause}
           )`,
          { [fidParam]: field.id, ...valueParam },
        );
      }
    }

    qb.skip((filters.page - 1) * filters.pageSize).take(filters.pageSize);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findById(id: string): Promise<ComplaintEntity> {
    const c = await this.complaints.findOne({ where: { id } });
    if (!c) throw new NotFoundException({ code: 'COMPLAINT_NOT_FOUND' });
    return c;
  }

  async detail(id: string, actor: AuthUser) {
    const complaint = await this.findById(id);
    this.assertVisible(complaint, actor);
    const visibleSchema = await this.fields.listForUser(actor);
    const allValues = await this.fieldValues.find({ where: { complaintId: id } });
    return this.toDto(complaint, allValues, visibleSchema);
  }

  // ─── create ────────────────────────────────────────────────────────────
  async create(dto: CreateComplaintDto, actor: AuthUser) {
    const fieldByKey = await this.fields.fullSchemaMap();
    const schemaArr = [...fieldByKey.values()];
    const validation = validateValues(dto.values, schemaArr);
    if (!validation.ok) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', errors: validation.errors });
    }

    const classification = await this.validateClassification({
      departmentId: dto.departmentId,
      subcategoryId: dto.subcategoryId,
      originId: dto.originId,
    });

    return this.dataSource.transaction(async (em) => {
      const referenceNo = await this.refs.next(em);
      const complaint = await em.getRepository(ComplaintEntity).save(
        em.getRepository(ComplaintEntity).create({
          referenceNo,
          status: 'open',
          priority: dto.priority ?? 'normal',
          createdBy: String(actor.id),
          complaintDate: dto.complaintDate ?? null,
          subcategoryId: classification.subcategoryId,
          originId: classification.originId,
        }),
      );

      // Persist each provided value.
      for (const [key, coerced] of Object.entries(validation.coerced)) {
        if (coerced.kind === 'unset') continue;
        const field = fieldByKey.get(key)!;
        // No locking concerns on the create path: no prior value exists. The
        // first writer (this actor) takes ownership when the field is locked.
        await this.persistValue(em, complaint.id, field, coerced, actor, /* takesOwnership */ true);
      }

      await this.audit.recordChange({
        em,
        complaintId: complaint.id,
        fieldKey: null,
        action: 'create',
        oldValue: null,
        newValue: {
          referenceNo,
          priority: complaint.priority,
          complaintDate: complaint.complaintDate,
          valueKeys: Object.keys(validation.coerced),
        },
        actorId: String(actor.id),
      });

      // Optional initial assignment.
      //
      // Anyone allowed to create a complaint may also route it on the same
      // submission — `complaint:assign` gates *re*assignment, not the
      // first-time routing. The audit row + assignment_history entry written
      // by AssignmentsService.apply() preserve who did it.
      if (dto.departmentId || dto.assignedTo) {
        await this.assignments.apply(
          em,
          complaint,
          {
            departmentId: dto.departmentId ?? null,
            userId: dto.assignedTo ?? null,
            note: dto.assignmentNote,
          },
          actor,
        );
      }

      const visibleSchema = filterVisible(schemaArr, actor);
      const persisted = await em.getRepository(ComplaintFieldValueEntity).find({ where: { complaintId: complaint.id } });
      return this.toDto(complaint, persisted, visibleSchema);
    });
  }

  // ─── update (dynamic field values + complaint_date) ───────────────────
  async update(id: string, dto: UpdateComplaintDto, actor: AuthUser) {
    const hasValuesPatch = !!dto.values && Object.keys(dto.values).length > 0;
    const hasDatePatch = Object.prototype.hasOwnProperty.call(dto, 'complaintDate');
    const hasSubcategoryPatch = Object.prototype.hasOwnProperty.call(dto, 'subcategoryId');
    const hasOriginPatch = Object.prototype.hasOwnProperty.call(dto, 'originId');
    if (!hasValuesPatch && !hasDatePatch && !hasSubcategoryPatch && !hasOriginPatch) {
      return this.detail(id, actor);
    }

    const fieldByKey = await this.fields.fullSchemaMap();
    const schemaArr = [...fieldByKey.values()];
    const validation = hasValuesPatch
      ? validateValues(dto.values!, schemaArr, { allowPartial: true })
      : { ok: true, errors: {}, coerced: {} as ReturnType<typeof validateValues>['coerced'] };
    if (!validation.ok) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', errors: validation.errors });
    }

    return this.dataSource.transaction(async (em) => {
      // Lock the parent row so concurrent edits on the same complaint serialize
      // and the lock-status check sees the previous edit's effect.
      const complaint = await em
        .getRepository(ComplaintEntity)
        .createQueryBuilder('c')
        .setLock('pessimistic_write')
        .where('c.id = :id', { id })
        .getOne();
      if (!complaint) throw new NotFoundException({ code: 'COMPLAINT_NOT_FOUND' });

      // Visibility scope — same rule as detail. A user without `complaint:read`
      // can only edit complaints they can see (their depts or their creations).
      this.assertVisible(complaint, actor);

      // Closed/resolved complaints are read-only — even for users who can
      // reopen them. The reopen permission is a status-transition gate, not
      // a free pass to edit. Forces the workflow: reopen → edit → reclose.
      assertEditable(complaint, actor);

      // ─── complaint_date branch ────────────────────────────────────────
      // Treated as a first-class scalar column (analogous to status/priority),
      // not a dynamic field. Anyone with `complaint:update` may set/clear it.
      if (hasDatePatch) {
        const oldDate = complaint.complaintDate;
        const newDate = dto.complaintDate ?? null;
        if (oldDate !== newDate) {
          complaint.complaintDate = newDate;
          await em.getRepository(ComplaintEntity).save(complaint);
          await this.audit.recordChange({
            em,
            complaintId: id,
            fieldKey: '__complaint_date__',
            action: 'update',
            oldValue: oldDate,
            newValue: newDate,
            actorId: String(actor.id),
          });
        }
      }

      // ─── origin branch ─────────────────────────────────────────────────
      if (hasOriginPatch) {
        if (dto.originId == null) {
          throw new BadRequestException({
            code: 'VALIDATION_FAILED',
            errors: { origin: ['REQUIRED'] },
          });
        }
        const newOrigin = await this.origins.findActive(dto.originId);
        if (!newOrigin) {
          throw new BadRequestException({
            code: 'VALIDATION_FAILED',
            errors: { origin: ['NOT_ACTIVE'] },
          });
        }
        const oldId = complaint.originId;
        if (String(oldId) !== String(newOrigin.id)) {
          complaint.originId = newOrigin.id;
          await em.getRepository(ComplaintEntity).save(complaint);
          await this.audit.recordChange({
            em,
            complaintId: id,
            fieldKey: '__origin__',
            action: 'update',
            oldValue: oldId,
            newValue: newOrigin.id,
            actorId: String(actor.id),
          });
        }
      }

      // ─── sub-category branch ───────────────────────────────────────────
      if (hasSubcategoryPatch) {
        const deptId = complaint.assignedDepartmentId;
        if (!deptId) {
          throw new BadRequestException({
            code: 'VALIDATION_FAILED',
            errors: { subcategory: ['NO_DEPARTMENT'] },
          });
        }
        const next = dto.subcategoryId;
        if (next == null) {
          const deptHasSubcats = await this.subcategories.hasActive(deptId);
          if (deptHasSubcats) {
            throw new BadRequestException({
              code: 'VALIDATION_FAILED',
              errors: { subcategory: ['REQUIRED'] },
            });
          }
          if (complaint.subcategoryId != null) {
            const old = complaint.subcategoryId;
            complaint.subcategoryId = null;
            await em.getRepository(ComplaintEntity).save(complaint);
            await this.audit.recordChange({
              em,
              complaintId: id,
              fieldKey: '__subcategory__',
              action: 'update',
              oldValue: old,
              newValue: null,
              actorId: String(actor.id),
            });
          }
        } else {
          const sub = await this.subcategories.findActiveForDepartment(next, deptId);
          if (!sub) {
            throw new BadRequestException({
              code: 'VALIDATION_FAILED',
              errors: { subcategory: ['DEPT_MISMATCH_OR_INACTIVE'] },
            });
          }
          if (String(complaint.subcategoryId) !== String(sub.id)) {
            const old = complaint.subcategoryId;
            complaint.subcategoryId = sub.id;
            await em.getRepository(ComplaintEntity).save(complaint);
            await this.audit.recordChange({
              em,
              complaintId: id,
              fieldKey: '__subcategory__',
              action: 'update',
              oldValue: old,
              newValue: sub.id,
              actorId: String(actor.id),
            });
          }
        }
      }

      const existingByFieldId = new Map(
        (await em.getRepository(ComplaintFieldValueEntity).find({ where: { complaintId: id } })).map((v) => [
          v.fieldId,
          v,
        ]),
      );

      for (const [key, coerced] of Object.entries(validation.coerced)) {
        const field = fieldByKey.get(key)!;
        const existing = existingByFieldId.get(field.id) ?? null;

        // A user explicitly sending a blank value for a required field is a
        // data-integrity hazard — refuse it. (allowPartial in the validator
        // only skips REQUIRED for *missing* keys; explicit blanks land here.)
        if (coerced.kind === 'unset' && field.isRequired) {
          throw new BadRequestException({
            code: 'VALIDATION_FAILED',
            errors: { [field.key]: ['REQUIRED'] },
          });
        }

        // Per-field write permission.
        const canWrite =
          hasPermission(actor.permissions, `complaint.field:${field.key}:write`) ||
          hasPermission(actor.permissions, 'complaint.field:*:write');
        if (!canWrite) {
          throw new ForbiddenException({
            code: 'RBAC_DENIED',
            missing: [`complaint.field:${field.key}:write`],
          });
        }

        // Skip if the new value matches the existing one.
        if (sameValue(existing, coerced)) continue;

        // Locking decision (also throws FIELD_LOCKED).
        const decision = this.locking.decide({
          field,
          existing,
          incomingIsBlank: coerced.kind === 'unset',
          actor,
        });

        const before = existing ? snapshot(existing, field) : null;

        if (coerced.kind === 'unset') {
          if (existing) {
            await em.getRepository(ComplaintFieldValueEntity).delete({ id: existing.id });
          }
        } else {
          await this.persistValue(
            em,
            id,
            field,
            coerced,
            actor,
            decision.kind === 'allow_takes_ownership',
          );
        }

        await this.audit.recordChange({
          em,
          complaintId: id,
          fieldKey: field.key,
          action: decision.kind === 'allow_with_override' ? 'lock_override' : 'update',
          oldValue: before,
          newValue: coerced.kind === 'unset' ? null : payload(coerced),
          actorId: String(actor.id),
        });
      }

      const visibleSchema = filterVisible(schemaArr, actor);
      const persisted = await em.getRepository(ComplaintFieldValueEntity).find({ where: { complaintId: id } });
      return this.toDto(complaint, persisted, visibleSchema);
    });
  }

  // ─── status / priority ─────────────────────────────────────────────────
  async setStatus(id: string, status: ComplaintStatus, actor: AuthUser, note?: string) {
    return this.scalarChange(id, '__status__', actor, async (em, c) => {
      const transition = classifyStatusTransition(c.status, status, actor);
      if (transition.kind === 'noop') return null;

      const old = c.status;
      c.status = status;
      await em.getRepository(ComplaintEntity).save(c);

      // Emit a distinct `reopen` audit row when the previous status was
      // frozen and the actor used `complaint:reopen` to transition out.
      // Optional note (UI prompts for one) lands on the audit row's `note`
      // column for historical context.
      return {
        old,
        next: status,
        action: transition.kind === 'reopen' ? ('reopen' as const) : ('update' as const),
        note,
      };
    });
  }

  async assign(
    id: string,
    input: { departmentId: string | null; userId?: string | null; note?: string },
    actor: AuthUser,
  ) {
    let movedAwayFromActor = false;
    await this.dataSource.transaction(async (em) => {
      const c = await em
        .getRepository(ComplaintEntity)
        .createQueryBuilder('c')
        .setLock('pessimistic_write')
        .where('c.id = :id', { id })
        .getOne();
      if (!c) throw new NotFoundException({ code: 'COMPLAINT_NOT_FOUND' });
      this.assertVisible(c, actor);
      assertEditable(c, actor);
      await this.assignments.apply(em, c, input, actor);

      // Detect cross-dept reassignment by a scoped user. Without `complaint:read`
      // the supervisor loses visibility the moment they route the complaint
      // out of their department — calling detail() would throw 404 even
      // though their own action just succeeded. Return a minimal ack instead.
      const newDept = input.departmentId ?? null;
      if (
        !actor.permissions.has('complaint:read') &&
        newDept != null &&
        !(actor.departmentIds ?? []).includes(String(newDept)) &&
        String(c.createdBy) !== String(actor.id)
      ) {
        movedAwayFromActor = true;
      }
    });

    if (movedAwayFromActor) {
      return {
        id,
        movedOutOfScope: true,
        assignedDepartmentId: input.departmentId,
        assignedTo: input.userId ?? null,
      };
    }
    // detail() reads via the global repo and must run AFTER the transaction
    // commits so it sees the new state.
    return this.detail(id, actor);
  }

  async setPriority(id: string, priority: ComplaintPriority, actor: AuthUser) {
    return this.scalarChange(id, '__priority__', actor, async (em, c) => {
      // Priority changes count as edits — refused on frozen complaints.
      assertEditable(c, actor);
      const old = c.priority;
      if (old === priority) return null;
      c.priority = priority;
      await em.getRepository(ComplaintEntity).save(c);
      return { old, next: priority };
    });
  }

  private async scalarChange(
    id: string,
    fieldKey: '__status__' | '__priority__',
    actor: AuthUser,
    work: (
      em: EntityManager,
      c: ComplaintEntity,
    ) => Promise<{ old: string; next: string; action?: 'update' | 'reopen'; note?: string } | null>,
  ) {
    await this.dataSource.transaction(async (em) => {
      // Lock the parent row so the freeze + transition checks see committed state.
      const c = await em
        .getRepository(ComplaintEntity)
        .createQueryBuilder('c')
        .setLock('pessimistic_write')
        .where('c.id = :id', { id })
        .getOne();
      if (!c) throw new NotFoundException({ code: 'COMPLAINT_NOT_FOUND' });
      this.assertVisible(c, actor);
      const change = await work(em, c);
      if (change) {
        await this.audit.recordChange({
          em,
          complaintId: id,
          fieldKey,
          action: change.action ?? 'update',
          oldValue: change.old,
          newValue: change.next,
          actorId: String(actor.id),
          note: change.note,
        });
      }
    });
    // detail() reads via the global repo and must run AFTER the transaction
    // commits so it sees the new state.
    return this.detail(id, actor);
  }

  // ─── persistence helper ───────────────────────────────────────────────
  private async persistValue(
    em: EntityManager,
    complaintId: string,
    field: DynamicFieldEntity,
    coerced: Exclude<CoercedValue, { kind: 'unset' }>,
    actor: AuthUser,
    takesOwnership: boolean,
  ): Promise<void> {
    const repo = em.getRepository(ComplaintFieldValueEntity);
    const existing = await repo.findOne({ where: { complaintId, fieldId: field.id } });
    const row =
      existing ??
      repo.create({
        complaintId,
        fieldId: field.id,
        valueText: null,
        valueNumber: null,
        valueDate: null,
        valueOptionId: null,
        ownerUserId: null,
        lockedAt: null,
      });

    row.valueText = null;
    row.valueNumber = null;
    row.valueDate = null;
    row.valueOptionId = null;

    switch (coerced.kind) {
      case 'text':
        row.valueText = coerced.value;
        break;
      case 'number':
        row.valueNumber = String(coerced.value);
        break;
      case 'date':
        row.valueDate = coerced.value;
        break;
      case 'dropdown':
        row.valueOptionId = coerced.optionId;
        break;
    }

    if (field.locking === 'first_writer_wins' && takesOwnership && !row.ownerUserId) {
      row.ownerUserId = String(actor.id);
      row.lockedAt = new Date();
    }

    await repo.save(row);
  }

  // ─── DTO shape ────────────────────────────────────────────────────────
  private toDto(c: ComplaintEntity, values: ComplaintFieldValueEntity[], visibleSchema: DynamicFieldEntity[]) {
    const visibleIds = new Set(visibleSchema.map((f) => f.id));
    const byFieldId = new Map(values.filter((v) => visibleIds.has(v.fieldId)).map((v) => [v.fieldId, v]));

    const valuesOut: Record<string, unknown> = {};
    const locks: Record<string, { ownerUserId: string; lockedAt: Date | null }> = {};

    for (const f of visibleSchema) {
      const v = byFieldId.get(f.id);
      if (!v) continue;
      valuesOut[f.key] = scalarFor(v, f);
      if (v.ownerUserId) {
        locks[f.key] = { ownerUserId: v.ownerUserId, lockedAt: v.lockedAt };
      }
    }

    return {
      id: c.id,
      referenceNo: c.referenceNo,
      status: c.status,
      priority: c.priority,
      createdBy: c.createdBy,
      assignedDepartmentId: c.assignedDepartmentId,
      assignedTo: c.assignedTo,
      assignedBy: c.assignedBy,
      assignedAt: c.assignedAt,
      complaintDate: c.complaintDate,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      originId: c.originId ?? null,
      subcategoryId: c.subcategoryId ?? null,
      values: valuesOut,
      locks,
    };
  }
}

// ─── helpers (file-local) ───────────────────────────────────────────────

function scalarFor(v: ComplaintFieldValueEntity, f: DynamicFieldEntity): unknown {
  switch (f.type) {
    case 'text': return v.valueText;
    case 'number': return v.valueNumber == null ? null : Number(v.valueNumber);
    case 'date': return v.valueDate;
    case 'dropdown': return v.valueOptionId;
    case 'file': return null;
  }
}

function snapshot(v: ComplaintFieldValueEntity, f: DynamicFieldEntity): unknown {
  return scalarFor(v, f);
}

function payload(coerced: Exclude<CoercedValue, { kind: 'unset' }>): unknown {
  switch (coerced.kind) {
    case 'text': return coerced.value;
    case 'number': return coerced.value;
    case 'date': return coerced.value;
    case 'dropdown': return coerced.optionId;
  }
}

function sameValue(existing: ComplaintFieldValueEntity | null, coerced: CoercedValue): boolean {
  if (!existing) return coerced.kind === 'unset';
  switch (coerced.kind) {
    case 'unset':
      return existing.valueText == null && existing.valueNumber == null && existing.valueDate == null && existing.valueOptionId == null;
    case 'text':
      return existing.valueText === coerced.value;
    case 'number':
      return existing.valueNumber != null && Number(existing.valueNumber) === coerced.value;
    case 'date':
      return existing.valueDate === coerced.value;
    case 'dropdown':
      return existing.valueOptionId === coerced.optionId;
  }
}

function filterVisible(schema: DynamicFieldEntity[], actor: AuthUser): DynamicFieldEntity[] {
  return schema.filter((f) => {
    const roles = f.visibility?.roles;
    if (!roles || roles === '*') return true;
    return actor.roleKeys.some((rk) => roles.includes(rk));
  });
}
