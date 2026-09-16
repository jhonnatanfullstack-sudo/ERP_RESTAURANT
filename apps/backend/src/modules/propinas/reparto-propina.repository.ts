import { tenantRepository } from '../../database/tenant-repository';
import { RepartoPropina } from './reparto-propina.entity';
import { DetalleRepartoPropina } from './detalle-reparto-propina.entity';

export const repartoPropinaRepository = tenantRepository(RepartoPropina);
export const detalleRepartoPropinaRepository = tenantRepository(DetalleRepartoPropina);
