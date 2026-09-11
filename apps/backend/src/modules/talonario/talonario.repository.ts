import { tenantRepository } from '../../database/tenant-repository';
import { Talonario } from './talonario.entity';
import { TalonarioUsuario } from './talonario-usuario.entity';

export const talonarioRepository = tenantRepository(Talonario);
export const talonarioUsuarioRepository = tenantRepository(TalonarioUsuario);
