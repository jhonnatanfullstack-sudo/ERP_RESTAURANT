import { tenantRepository } from '../../database/tenant-repository';
import { Caja } from './caja.entity';
import { MovimientoCaja } from './movimiento-caja.entity';

export const cajaRepository = tenantRepository(Caja);
export const movimientoCajaRepository = tenantRepository(MovimientoCaja);
