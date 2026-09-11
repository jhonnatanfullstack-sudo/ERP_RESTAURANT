import { tenantRepository } from '../../database/tenant-repository';
import { Comanda } from './comanda.entity';

export const comandaRepository = tenantRepository(Comanda);
