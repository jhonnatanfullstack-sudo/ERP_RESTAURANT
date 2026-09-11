import { tenantRepository } from '../../database/tenant-repository';
import { Permiso } from './permiso.entity';

export const permisoRepository = tenantRepository(Permiso);
