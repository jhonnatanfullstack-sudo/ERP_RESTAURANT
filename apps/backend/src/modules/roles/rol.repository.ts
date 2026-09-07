import { AppDataSource } from '../../database/data-source';
import { Rol } from './rol.entity';

export const rolRepository = AppDataSource.getRepository(Rol);
