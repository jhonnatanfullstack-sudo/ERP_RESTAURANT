import { tenantRepository } from '../../database/tenant-repository';
import { Cliente } from './cliente.entity';

export const clienteRepository = tenantRepository(Cliente);
