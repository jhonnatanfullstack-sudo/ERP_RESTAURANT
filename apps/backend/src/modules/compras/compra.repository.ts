import { AppDataSource } from '../../database/data-source';
import { Compra } from './compra.entity';
import { DetalleCompra } from './detalle-compra.entity';

export const compraRepository = AppDataSource.getRepository(Compra);
export const detalleCompraRepository = AppDataSource.getRepository(DetalleCompra);
