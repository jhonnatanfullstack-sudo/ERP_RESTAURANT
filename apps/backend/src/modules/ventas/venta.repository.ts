import { tenantRepository } from '../../database/tenant-repository';
import { Venta } from './venta.entity';
import { DetalleVenta } from './detalle-venta.entity';

export const ventaRepository = tenantRepository(Venta);
export const detalleVentaRepository = tenantRepository(DetalleVenta);
