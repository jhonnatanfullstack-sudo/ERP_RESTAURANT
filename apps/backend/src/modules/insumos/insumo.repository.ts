import { tenantRepository } from '../../database/tenant-repository';
import { Insumo } from './insumo.entity';

export const insumoRepository = tenantRepository(Insumo);
