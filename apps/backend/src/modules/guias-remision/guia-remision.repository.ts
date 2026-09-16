import { tenantRepository } from '../../database/tenant-repository';
import { GuiaRemision } from './guia-remision.entity';
import { DetalleGuiaRemision } from './detalle-guia-remision.entity';

export const guiaRemisionRepository = tenantRepository(GuiaRemision);
export const detalleGuiaRemisionRepository = tenantRepository(DetalleGuiaRemision);
