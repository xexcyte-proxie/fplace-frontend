import type { ProductTourPreference } from '../domain/entities';
import type { ProductTourRepository } from '../domain/repositories/product-tour-repository';
import {
  productTourLocalDatasource,
  type ProductTourLocalDatasource,
} from './datasources/product-tour-local-datasource';

export class ProductTourRepositoryImpl implements ProductTourRepository {
  constructor(
    private readonly datasource: ProductTourLocalDatasource = productTourLocalDatasource,
  ) {}

  load(): ProductTourPreference {
    return this.datasource.load();
  }

  save(preference: ProductTourPreference): void {
    this.datasource.save(preference);
  }

  clear(): void {
    this.datasource.clear();
  }
}

export const productTourRepository = new ProductTourRepositoryImpl();
