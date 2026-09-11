import { tenantRepository } from '../../database/tenant-repository';
import { Almacen } from './almacen.entity';

export const almacenRepository = tenantRepository(Almacen);
