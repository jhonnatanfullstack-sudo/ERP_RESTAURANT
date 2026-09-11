import { tenantRepository } from '../../database/tenant-repository';
import { Personal } from './personal.entity';

export const personalRepository = tenantRepository(Personal);
