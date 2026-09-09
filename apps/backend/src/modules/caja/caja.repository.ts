import { AppDataSource } from '../../database/data-source';
import { Caja } from './caja.entity';
import { MovimientoCaja } from './movimiento-caja.entity';

export const cajaRepository = AppDataSource.getRepository(Caja);
export const movimientoCajaRepository = AppDataSource.getRepository(MovimientoCaja);
