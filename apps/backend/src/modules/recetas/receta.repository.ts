import { tenantRepository } from '../../database/tenant-repository';
import { RecetaInsumo } from './receta-insumo.entity';

export const recetaInsumoRepository = tenantRepository(RecetaInsumo);
