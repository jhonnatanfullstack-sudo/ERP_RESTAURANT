import { tenantRepository } from '../../database/tenant-repository';
import { Rol } from './rol.entity';

export const rolRepository = tenantRepository(Rol);
