import { AppDataSource } from '../../database/data-source';
import { Personal } from './personal.entity';

export const personalRepository = AppDataSource.getRepository(Personal);
