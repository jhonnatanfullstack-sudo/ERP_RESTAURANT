import { AppDataSource } from '../../database/data-source';
import { Categoria } from './categoria.entity';

export const categoriaRepository = AppDataSource.getRepository(Categoria);
