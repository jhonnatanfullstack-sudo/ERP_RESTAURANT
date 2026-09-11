import { tenantRepository } from '../../database/tenant-repository';
import { Mesa } from './mesa.entity';

export const mesaRepository = tenantRepository(Mesa);
