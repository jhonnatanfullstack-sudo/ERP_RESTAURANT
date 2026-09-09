import { AppDataSource } from '../../database/data-source';
import { Insumo } from './insumo.entity';

export const insumoRepository = AppDataSource.getRepository(Insumo);
