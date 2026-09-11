import { tenantRepository } from '../../database/tenant-repository';
import { Usuario } from './usuario.entity';

export const usuarioRepository = tenantRepository(Usuario);
