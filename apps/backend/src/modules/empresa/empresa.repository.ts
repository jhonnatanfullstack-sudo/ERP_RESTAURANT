import { AppDataSource } from '../../database/data-source';
import { Empresa } from './empresa.entity';

export const empresaRepository = AppDataSource.getRepository(Empresa);
