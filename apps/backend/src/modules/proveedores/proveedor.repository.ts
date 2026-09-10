import { AppDataSource } from '../../database/data-source';
import { Proveedor } from './proveedor.entity';

export const proveedorRepository = AppDataSource.getRepository(Proveedor);
