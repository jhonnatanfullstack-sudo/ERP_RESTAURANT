import { tenantRepository } from '../../database/tenant-repository';
import { Configuracion } from './configuracion.entity';

export const configuracionRepository = tenantRepository(Configuracion);
