import { tenantRepository } from '../../database/tenant-repository';
import { Salon } from './salon.entity';

export const salonRepository = tenantRepository(Salon);
