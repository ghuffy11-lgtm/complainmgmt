import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DynamicFieldEntity } from './entities/dynamic-field.entity';
import { DynamicFieldOptionEntity } from './entities/dynamic-field-option.entity';
import { ComplaintFieldValueEntity } from '../complaints/entities/complaint-field-value.entity';
import { PermissionEntity } from '../permissions/entities/permission.entity';
import { AuthUser } from '../auth/auth-user.type';
import {
  CreateFieldDto,
  FieldOptionInputDto,
  UpdateFieldDto,
} from './dto/upsert-field.dto';

const FIELD_PERM_ACTIONS = ['read', 'write', 'override'] as const;

@Injectable()
export class DynamicFieldsService {
  constructor(
    @InjectRepository(DynamicFieldEntity) private readonly fields: Repository<DynamicFieldEntity>,
    @InjectRepository(DynamicFieldOptionEntity) private readonly options: Repository<DynamicFieldOptionEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /** Active schema visible to the given user (filtered by visibility.roles). */
  async listForUser(user: AuthUser): Promise<DynamicFieldEntity[]> {
    const all = await this.fields.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC' },
      relations: ['options'],
    });
    return all.filter((f) => isVisibleTo(f, user));
  }

  /** Full schema (admin). */
  fullSchema(): Promise<DynamicFieldEntity[]> {
    return this.fields.find({ order: { sortOrder: 'ASC' }, relations: ['options'] });
  }

  /** Map keyed by field.key for fast lookup during validation/diffing. */
  async fullSchemaMap(): Promise<Map<string, DynamicFieldEntity>> {
    const all = await this.fullSchema();
    return new Map(all.map((f) => [f.key, f]));
  }

  async findById(id: string): Promise<DynamicFieldEntity> {
    const f = await this.fields.findOne({ where: { id }, relations: ['options'] });
    if (!f) throw new NotFoundException({ code: 'FIELD_NOT_FOUND' });
    return f;
  }

  /**
   * Create a new dynamic field and atomically provision per-field permissions
   * (`complaint.field:<key>:read|write|override`) so admins can grant them in
   * the role permission grid right away.
   */
  async create(dto: CreateFieldDto): Promise<DynamicFieldEntity> {
    if (await this.fields.findOne({ where: { key: dto.key } })) {
      throw new ConflictException({ code: 'FIELD_KEY_TAKEN' });
    }
    return this.dataSource.transaction(async (em) => {
      const field = await em.getRepository(DynamicFieldEntity).save(
        em.getRepository(DynamicFieldEntity).create({
          key: dto.key,
          label: dto.label,
          type: dto.type,
          isRequired: dto.isRequired ?? false,
          isActive: dto.isActive ?? true,
          isSearchable: dto.isSearchable ?? false,
          sortOrder: dto.sortOrder ?? 0,
          validation: dto.validation ?? {},
          visibility: (dto.visibility as DynamicFieldEntity['visibility']) ?? { roles: '*' },
          locking: dto.locking ?? 'none',
          isSystem: false,
        }),
      );
      await this.provisionPermissions(em.getRepository(PermissionEntity), field.key);
      return field;
    });
  }

  /**
   * Update a field. `key` and `type` are immutable post-creation — those
   * fields aren't even on the DTO; this is enforced both in code and by the
   * type system.
   */
  async update(id: string, dto: UpdateFieldDto): Promise<DynamicFieldEntity> {
    const field = await this.findById(id);
    Object.assign(field, {
      ...dto,
      visibility: (dto.visibility as DynamicFieldEntity['visibility']) ?? field.visibility,
    });
    await this.fields.save(field);
    return this.findById(id);
  }

  /**
   * Remove a field.
   *   - System fields are never deleted; admins must deactivate them instead.
   *   - Refuses to delete a field that has any complaint values — admin should
   *     deactivate first to preserve historical data.
   *   - On success, also deletes the per-field permissions (FK cascade
   *     drops the role_permissions rows that referenced them).
   */
  async remove(id: string): Promise<void> {
    const field = await this.findById(id);
    if (field.isSystem) throw new BadRequestException({ code: 'FIELD_IS_SYSTEM' });

    await this.dataSource.transaction(async (em) => {
      const valueCount = await em
        .getRepository(ComplaintFieldValueEntity)
        .count({ where: { fieldId: field.id } });
      if (valueCount > 0) {
        throw new BadRequestException({ code: 'FIELD_HAS_VALUES', count: valueCount });
      }
      await em.getRepository(DynamicFieldEntity).delete({ id: field.id });
      // FK cascade removes dynamic_field_options.
      // Permissions don't reference dynamic_fields, so drop them explicitly.
      await em.getRepository(PermissionEntity).delete({ resource: `complaint.field:${field.key}` });
    });
  }

  /** Replace a field's option list atomically. Existing values keyed by `id` are preserved. */
  async replaceOptions(fieldId: string, inputs: FieldOptionInputDto[]): Promise<DynamicFieldEntity> {
    const field = await this.findById(fieldId);
    if (field.type !== 'dropdown') {
      throw new BadRequestException({ code: 'NOT_A_DROPDOWN_FIELD' });
    }
    await this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(DynamicFieldOptionEntity);
      const existing = await repo.find({ where: { fieldId } });
      const keepIds = new Set(inputs.filter((i) => !!i.id).map((i) => i.id!));

      // Delete options no longer present.
      const toDelete = existing.filter((e) => !keepIds.has(e.id));
      if (toDelete.length) await repo.delete(toDelete.map((e) => e.id));

      for (const input of inputs) {
        if (input.id) {
          await repo.update(
            { id: input.id, fieldId },
            {
              value: input.value,
              label: input.label,
              sortOrder: input.sortOrder ?? 0,
              isActive: input.isActive ?? true,
            },
          );
        } else {
          await repo.insert({
            fieldId,
            value: input.value,
            label: input.label,
            sortOrder: input.sortOrder ?? 0,
            isActive: input.isActive ?? true,
          });
        }
      }
    });
    return this.findById(fieldId);
  }

  /**
   * Insert the three per-field permissions (read/write/override). Idempotent
   * via ON CONFLICT — already-seeded system fields get a no-op.
   */
  private async provisionPermissions(repo: Repository<PermissionEntity>, fieldKey: string): Promise<void> {
    const resource = `complaint.field:${fieldKey}`;
    await repo
      .createQueryBuilder()
      .insert()
      .values(FIELD_PERM_ACTIONS.map((action) => ({ resource, action, description: null })))
      .orIgnore()
      .execute();
  }
}

function isVisibleTo(field: DynamicFieldEntity, user: AuthUser): boolean {
  const roles = field.visibility?.roles;
  if (!roles || roles === '*') return true;
  return user.roleKeys.some((rk) => roles.includes(rk));
}
