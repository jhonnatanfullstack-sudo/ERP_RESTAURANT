import { tenantRepository } from '../../database/tenant-repository';
import { Producto } from './producto.entity';

export const productoRepository = tenantRepository(Producto);
