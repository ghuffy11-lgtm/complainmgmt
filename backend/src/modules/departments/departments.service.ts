import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DepartmentEntity } from './entities/department.entity';

@Injectable()
export class DepartmentsService {
  constructor(@InjectRepository(DepartmentEntity) private readonly repo: Repository<DepartmentEntity>) {}

  list() {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async create(input: { key: string; name: string }): Promise<DepartmentEntity> {
    if (await this.repo.findOne({ where: { key: input.key } })) {
      throw new ConflictException({ code: 'DEPARTMENT_KEY_TAKEN' });
    }
    return this.repo.save(this.repo.create(input));
  }

  async update(id: string, patch: Partial<DepartmentEntity>): Promise<DepartmentEntity> {
    const d = await this.repo.findOne({ where: { id } });
    if (!d) throw new NotFoundException({ code: 'DEPARTMENT_NOT_FOUND' });
    Object.assign(d, patch);
    return this.repo.save(d);
  }
}
