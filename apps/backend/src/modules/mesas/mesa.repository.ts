import { AppDataSource } from '../../database/data-source';
import { Mesa } from './mesa.entity';

export const mesaRepository = AppDataSource.getRepository(Mesa);
