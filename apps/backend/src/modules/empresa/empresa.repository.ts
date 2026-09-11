import { tenantRepository } from '../../database/tenant-repository';
import { Empresa } from './empresa.entity';

export const empresaRepository = tenantRepository(Empresa);
