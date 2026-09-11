import { tenantRepository } from '../../database/tenant-repository';
import { Existencia } from './existencia.entity';

export const existenciaRepository = tenantRepository(Existencia);
