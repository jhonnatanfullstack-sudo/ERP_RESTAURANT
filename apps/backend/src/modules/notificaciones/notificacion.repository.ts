import { tenantRepository } from '../../database/tenant-repository';
import { Notificacion } from './notificacion.entity';

export const notificacionRepository = tenantRepository(Notificacion);
