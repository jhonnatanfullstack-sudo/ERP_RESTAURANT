import { AppDataSource } from '../../database/data-source';
import { Reserva } from './reserva.entity';

export const reservaRepository = AppDataSource.getRepository(Reserva);
