import { tenantRepository } from '../../database/tenant-repository';
import { Reserva } from './reserva.entity';

export const reservaRepository = tenantRepository(Reserva);
