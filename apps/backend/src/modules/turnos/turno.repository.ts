import { tenantRepository } from '../../database/tenant-repository';
import { Turno } from './turno.entity';

export const turnoRepository = tenantRepository(Turno);
