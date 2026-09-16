import { tenantRepository } from '../../database/tenant-repository';
import { NotaVenta } from './nota-venta.entity';
import { DetalleNotaVenta } from './detalle-nota-venta.entity';

export const notaVentaRepository = tenantRepository(NotaVenta);
export const detalleNotaVentaRepository = tenantRepository(DetalleNotaVenta);
