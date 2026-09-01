import type { ProductTourRepository } from '../domain/repositories/product-tour-repository';
import {
  productTourLocalDatasource,
  type ProductTourLocalDatasource,
} from './datasources/product-tour-local-datasource';

export class ProductTourRepositoryImpl implements ProductTourRepository {
  constructor(
    private readonly datasource: ProductTourLocalDatasource = productTourLocalDatasource,
  ) {}

  hasCompleted(): boolean {
    return this.datasource.hasCompleted();
  }

  markCompleted(): void {
    this.datasource.markCompleted();
  }

  clear(): void {
    this.datasource.clear();
  }
}

export const productTourRepository = new ProductTourRepositoryImpl();
