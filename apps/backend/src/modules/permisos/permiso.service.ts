import { permisoRepository } from './permiso.repository';
import type { Permiso } from './permiso.entity';

export async function listarPermisos(): Promise<Permiso[]> {
  return permisoRepository.find({ order: { codigo: 'ASC' } });
}
