import { AppDataSource } from '../../database/data-source';
import { Venta } from './venta.entity';
import { DetalleVenta } from './detalle-venta.entity';

export const ventaRepository = AppDataSource.getRepository(Venta);
export const detalleVentaRepository = AppDataSource.getRepository(DetalleVenta);
