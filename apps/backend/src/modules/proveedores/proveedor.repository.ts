import { tenantRepository } from '../../database/tenant-repository';
import { Proveedor } from './proveedor.entity';

export const proveedorRepository = tenantRepository(Proveedor);
