import { AppDataSource } from '../../database/data-source';
import { Existencia } from './existencia.entity';

export const existenciaRepository = AppDataSource.getRepository(Existencia);
