import { tenantRepository } from '../../database/tenant-repository';
import { MovimientoFidelizacion } from './movimiento-fidelizacion.entity';

export const movimientoFidelizacionRepository = tenantRepository(MovimientoFidelizacion);
