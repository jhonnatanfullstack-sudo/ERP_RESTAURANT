import { AppDataSource } from '../../database/data-source';
import { Producto } from './producto.entity';

export const productoRepository = AppDataSource.getRepository(Producto);
