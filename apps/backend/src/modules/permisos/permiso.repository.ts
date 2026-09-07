import { AppDataSource } from '../../database/data-source';
import { Permiso } from './permiso.entity';

export const permisoRepository = AppDataSource.getRepository(Permiso);
