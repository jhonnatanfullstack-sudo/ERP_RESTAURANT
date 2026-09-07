import { AppDataSource } from '../../database/data-source';
import { Usuario } from './usuario.entity';

export const usuarioRepository = AppDataSource.getRepository(Usuario);
