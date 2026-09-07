import { AppDataSource } from '../../database/data-source';
import { Cliente } from './cliente.entity';

export const clienteRepository = AppDataSource.getRepository(Cliente);
