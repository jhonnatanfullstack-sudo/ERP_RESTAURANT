import { tenantRepository } from '../../database/tenant-repository';
import { Marca } from './marca.entity';

export const marcaRepository = tenantRepository(Marca);
