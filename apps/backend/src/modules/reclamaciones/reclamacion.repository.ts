import { tenantRepository } from '../../database/tenant-repository';
import { Reclamacion } from './reclamacion.entity';

export const reclamacionRepository = tenantRepository(Reclamacion);
