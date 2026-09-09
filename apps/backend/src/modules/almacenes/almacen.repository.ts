import { AppDataSource } from '../../database/data-source';
import { Almacen } from './almacen.entity';

export const almacenRepository = AppDataSource.getRepository(Almacen);
