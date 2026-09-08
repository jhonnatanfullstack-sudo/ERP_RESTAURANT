import { AppDataSource } from '../../database/data-source';
import { Comanda } from './comanda.entity';

export const comandaRepository = AppDataSource.getRepository(Comanda);
