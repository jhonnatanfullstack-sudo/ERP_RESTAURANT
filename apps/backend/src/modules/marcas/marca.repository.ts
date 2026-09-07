import { AppDataSource } from '../../database/data-source';
import { Marca } from './marca.entity';

export const marcaRepository = AppDataSource.getRepository(Marca);
