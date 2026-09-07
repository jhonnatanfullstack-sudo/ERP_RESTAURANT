import { In } from 'typeorm';
import { HttpError } from '../../utils/http-error';
import { permisoRepository } from '../permisos/permiso.repository';
import { rolRepository } from './rol.repository';
import type { ActualizarRolDto, AsignarPermisosDto, CrearRolDto } from './rol.dto';
import type { Rol } from './rol.entity';

export async function listarRoles(): Promise<Rol[]> {
  return rolRepository.find({ relations: { permisos: true }, order: { nombre: 'ASC' } });
}

export async function obtenerRol(id: string): Promise<Rol> {
  const rol = await rolRepository.findOne({ where: { id }, relations: { permisos: true } });
  if (!rol) {
    throw new HttpError(404, 'Rol no encontrado');
  }
  return rol;
}

async function resolverPermisos(permisoIds: string[]) {
  if (permisoIds.length === 0) return [];
  const permisos = await permisoRepository.findBy({ id: In(permisoIds) });
  if (permisos.length !== permisoIds.length) {
    throw new HttpError(400, 'Uno o más permisos indicados no existen');
  }
  return permisos;
}

export async function crearRol(dto: CrearRolDto): Promise<Rol> {
  const existente = await rolRepository.findOneBy({ nombre: dto.nombre });
  if (existente) {
    throw new HttpError(409, 'Ya existe un rol con ese nombre');
  }

  const permisos = await resolverPermisos(dto.permisoIds);
  const rol = rolRepository.create({ nombre: dto.nombre, descripcion: dto.descripcion, permisos });
  return rolRepository.save(rol);
}

export async function actualizarRol(id: string, dto: ActualizarRolDto): Promise<Rol> {
  const rol = await obtenerRol(id);

  if (dto.nombre && dto.nombre !== rol.nombre) {
    const existente = await rolRepository.findOneBy({ nombre: dto.nombre });
    if (existente) {
      throw new HttpError(409, 'Ya existe un rol con ese nombre');
    }
  }

  Object.assign(rol, dto);
  return rolRepository.save(rol);
}

export async function asignarPermisos(id: string, dto: AsignarPermisosDto): Promise<Rol> {
  const rol = await obtenerRol(id);
  rol.permisos = await resolverPermisos(dto.permisoIds);
  return rolRepository.save(rol);
}
