import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { SubcategoriesService } from './subcategories.service';
import { SubcategoryEntity } from './entities/subcategory.entity';

function repoMock(): jest.Mocked<Repository<SubcategoryEntity>> {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    save: jest.fn((x: unknown) => Promise.resolve(x)),
    create: jest.fn((x: unknown) => x),
  } as unknown as jest.Mocked<Repository<SubcategoryEntity>>;
}

describe('SubcategoriesService', () => {
  test('list returns rows ordered by name for the given department', async () => {
    const repo = repoMock();
    repo.find.mockResolvedValue([]);
    const svc = new SubcategoriesService(repo);
    await svc.listForDepartment('7');
    expect(repo.find).toHaveBeenCalledWith({
      where: { departmentId: '7' },
      order: { name: 'ASC' },
    });
  });

  test('create rejects duplicate (departmentId, key)', async () => {
    const repo = repoMock();
    repo.findOne.mockResolvedValue({ id: '99' } as SubcategoryEntity);
    const svc = new SubcategoriesService(repo);
    await expect(
      svc.create('7', { key: 'network', name: 'Network' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  test('create saves with departmentId attached', async () => {
    const repo = repoMock();
    repo.findOne.mockResolvedValue(null);
    const svc = new SubcategoriesService(repo);
    await svc.create('7', { key: 'network', name: 'Network' });
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ departmentId: '7', key: 'network', name: 'Network' }),
    );
  });

  test('update throws SUBCATEGORY_NOT_FOUND for unknown id', async () => {
    const repo = repoMock();
    repo.findOne.mockResolvedValue(null);
    const svc = new SubcategoriesService(repo);
    await expect(svc.update('123', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
  });

  test('listAll filters by active flag when requested', async () => {
    const repo = repoMock();
    repo.find.mockResolvedValue([]);
    const svc = new SubcategoriesService(repo);
    await svc.listAll({ active: true });
    expect(repo.find).toHaveBeenCalledWith({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  });

  test('hasActive returns true when at least one row matches', async () => {
    const repo = repoMock();
    repo.count.mockResolvedValue(2);
    const svc = new SubcategoriesService(repo);
    expect(await svc.hasActive('5')).toBe(true);
    expect(repo.count).toHaveBeenCalledWith({
      where: { departmentId: '5', isActive: true },
    });
  });

  test('findActiveForDepartment rejects mismatched department', async () => {
    const repo = repoMock();
    repo.findOne.mockResolvedValue({
      id: '1', departmentId: '7', isActive: true,
    } as SubcategoryEntity);
    const svc = new SubcategoriesService(repo);
    expect(await svc.findActiveForDepartment('1', '99')).toBeNull();
  });

  test('findActiveForDepartment rejects inactive subcat', async () => {
    const repo = repoMock();
    repo.findOne.mockResolvedValue({
      id: '1', departmentId: '7', isActive: false,
    } as SubcategoryEntity);
    const svc = new SubcategoriesService(repo);
    expect(await svc.findActiveForDepartment('1', '7')).toBeNull();
  });
});
