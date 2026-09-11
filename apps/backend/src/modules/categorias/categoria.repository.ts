import { tenantRepository } from '../../database/tenant-repository';
import { Categoria } from './categoria.entity';

export const categoriaRepository = tenantRepository(Categoria);
