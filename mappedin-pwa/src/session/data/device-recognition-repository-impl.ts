import type { DeviceRecognitionRepository } from '../domain/repositories/device-recognition-repository';
import {
  deviceRecognitionLocalDatasource,
  type DeviceRecognitionLocalDatasource,
} from './datasources/device-recognition-local-datasource';

export class DeviceRecognitionRepositoryImpl
  implements DeviceRecognitionRepository
{
  constructor(
    private readonly datasource: DeviceRecognitionLocalDatasource = deviceRecognitionLocalDatasource,
  ) {}

  hasUsedApp(): boolean {
    return this.datasource.hasUsedApp();
  }

  markUsed(): void {
    this.datasource.markUsed();
  }

  clear(): void {
    this.datasource.clear();
  }
}

export const deviceRecognitionRepository =
  new DeviceRecognitionRepositoryImpl();
