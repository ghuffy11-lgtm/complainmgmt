import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { OriginsService } from './origins.service';
import { OriginEntity } from './entities/origin.entity';

function repoMock(): jest.Mocked<Repository<OriginEntity>> {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn((x: unknown) => Promise.resolve(x)),
    create: jest.fn((x: unknown) => x),
    createQueryBuilder: jest.fn(),
  } as unknown as jest.Mocked<Repository<OriginEntity>>;
}

describe('OriginsService', () => {
  test('list orders by sort_order then name', async () => {
    const repo = repoMock();
    repo.find.mockResolvedValue([]);
    const svc = new OriginsService(repo);
    await svc.list();
    expect(repo.find).toHaveBeenCalledWith({
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  });

  test('create rejects duplicate key', async () => {
    const repo = repoMock();
    repo.findOne.mockResolvedValue({ id: '1' } as OriginEntity);
    const svc = new OriginsService(repo);
    await expect(
      svc.create({ key: 'verbal', name: 'Verbal' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  test('create defaults sortOrder to max+10 when not provided', async () => {
    const repo = repoMock();
    repo.findOne.mockResolvedValue(null);
    (repo.createQueryBuilder as unknown as jest.Mock) = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max: '30' }),
    });
    const svc = new OriginsService(repo);
    await svc.create({ key: 'email', name: 'Email' });
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'email', name: 'Email', sortOrder: 40 }),
    );
  });

  test('update throws ORIGIN_NOT_FOUND for unknown id', async () => {
    const repo = repoMock();
    repo.findOne.mockResolvedValue(null);
    const svc = new OriginsService(repo);
    await expect(svc.update('77', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
  });

  test('findActive returns null for inactive origin', async () => {
    const repo = repoMock();
    repo.findOne.mockResolvedValue({ id: '1', isActive: false } as OriginEntity);
    const svc = new OriginsService(repo);
    expect(await svc.findActive('1')).toBeNull();
  });

  test('findActive returns row when active', async () => {
    const repo = repoMock();
    const row = { id: '1', isActive: true } as OriginEntity;
    repo.findOne.mockResolvedValue(row);
    const svc = new OriginsService(repo);
    expect(await svc.findActive('1')).toBe(row);
  });
});
