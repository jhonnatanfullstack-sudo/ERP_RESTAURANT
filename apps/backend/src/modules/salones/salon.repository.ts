import { AppDataSource } from '../../database/data-source';
import { Salon } from './salon.entity';

export const salonRepository = AppDataSource.getRepository(Salon);
