import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubcategoryEntity } from './entities/subcategory.entity';

@Injectable()
export class SubcategoriesService {
  constructor(
    @InjectRepository(SubcategoryEntity)
    private readonly repo: Repository<SubcategoryEntity>,
  ) {}

  listForDepartment(departmentId: string) {
    return this.repo.find({
      where: { departmentId },
      order: { name: 'ASC' },
    });
  }

  listAll(opts: { active?: boolean } = {}) {
    const where = opts.active === undefined ? {} : { isActive: opts.active };
    return this.repo.find({ where, order: { name: 'ASC' } });
  }

  async create(
    departmentId: string,
    input: { key: string; name: string },
  ): Promise<SubcategoryEntity> {
    const existing = await this.repo.findOne({
      where: { departmentId, key: input.key },
    });
    if (existing) {
      throw new ConflictException({ code: 'SUBCATEGORY_KEY_TAKEN' });
    }
    return this.repo.save(this.repo.create({ departmentId, ...input }));
  }

  async update(
    id: string,
    patch: Partial<Pick<SubcategoryEntity, 'name' | 'isActive'>>,
  ): Promise<SubcategoryEntity> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException({ code: 'SUBCATEGORY_NOT_FOUND' });
    Object.assign(row, patch);
    return this.repo.save(row);
  }

  async findActiveForDepartment(
    id: string,
    departmentId: string,
  ): Promise<SubcategoryEntity | null> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row || !row.isActive || String(row.departmentId) !== String(departmentId)) return null;
    return row;
  }

  async hasActive(departmentId: string): Promise<boolean> {
    const n = await this.repo.count({
      where: { departmentId, isActive: true },
    });
    return n > 0;
  }
}
