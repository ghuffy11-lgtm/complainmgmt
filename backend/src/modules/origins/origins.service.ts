import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OriginEntity } from './entities/origin.entity';

@Injectable()
export class OriginsService {
  constructor(
    @InjectRepository(OriginEntity)
    private readonly repo: Repository<OriginEntity>,
  ) {}

  list() {
    return this.repo.find({ order: { sortOrder: 'ASC', name: 'ASC' } });
  }

  async create(input: { key: string; name: string; sortOrder?: number }): Promise<OriginEntity> {
    const dup = await this.repo.findOne({ where: { key: input.key } });
    if (dup) throw new ConflictException({ code: 'ORIGIN_KEY_TAKEN' });
    const sortOrder = input.sortOrder ?? (await this.nextSortOrder());
    return this.repo.save(this.repo.create({ ...input, sortOrder }));
  }

  async update(
    id: string,
    patch: Partial<Pick<OriginEntity, 'name' | 'isActive' | 'sortOrder'>>,
  ): Promise<OriginEntity> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException({ code: 'ORIGIN_NOT_FOUND' });
    Object.assign(row, patch);
    return this.repo.save(row);
  }

  async findActive(id: string): Promise<OriginEntity | null> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row || !row.isActive) return null;
    return row;
  }

  private async nextSortOrder(): Promise<number> {
    const r = await this.repo
      .createQueryBuilder('o')
      .select('MAX(o.sort_order)', 'max')
      .getRawOne<{ max: string | null }>();
    const cur = r?.max == null ? 0 : Number(r.max);
    return cur + 10;
  }
}
