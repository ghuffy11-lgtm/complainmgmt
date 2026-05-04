import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

@Injectable()
export class TransactionService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Run `work` inside a single DB transaction. The same EntityManager is passed to
   * the callback so that all repository calls inside join the transaction.
   *
   * Why not @Transactional decorator? Explicit beats magic — making the unit-of-work
   * visible at the call site is the convention this codebase enforces.
   */
  run<T>(work: (em: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(work);
  }
}
