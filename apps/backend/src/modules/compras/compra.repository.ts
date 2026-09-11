import { tenantRepository } from '../../database/tenant-repository';
import { Compra } from './compra.entity';
import { DetalleCompra } from './detalle-compra.entity';

export const compraRepository = tenantRepository(Compra);
export const detalleCompraRepository = tenantRepository(DetalleCompra);
