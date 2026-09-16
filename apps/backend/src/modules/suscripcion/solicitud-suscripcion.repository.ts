import { tenantRepository } from '../../database/tenant-repository';
import { SolicitudSuscripcion } from './solicitud-suscripcion.entity';

export const solicitudSuscripcionRepository = tenantRepository(SolicitudSuscripcion);
