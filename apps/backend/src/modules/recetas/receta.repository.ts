import { AppDataSource } from '../../database/data-source';
import { RecetaInsumo } from './receta-insumo.entity';

export const recetaInsumoRepository = AppDataSource.getRepository(RecetaInsumo);
