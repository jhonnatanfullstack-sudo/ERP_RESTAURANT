import { HttpError } from '../../utils/http-error';
import { salonRepository } from './salon.repository';
import { mesaRepository } from '../mesas/mesa.repository';
import type { ActualizarSalonDto, CrearSalonDto } from './salon.dto';
import type { Salon } from './salon.entity';

export async function listarSalones(): Promise<Salon[]> {
  return salonRepository.find({ order: { nombre: 'ASC' } });
}

export async function obtenerSalon(id: string): Promise<Salon> {
  const salon = await salonRepository.findOneBy({ id });
  if (!salon) {
    throw new HttpError(404, 'Salón no encontrado');
  }
  return salon;
}

export async function crearSalon(dto: CrearSalonDto): Promise<Salon> {
  const existente = await salonRepository.findOneBy({ nombre: dto.nombre });
  if (existente) {
    throw new HttpError(409, 'Ya existe un salón con ese nombre');
  }

  const salon = salonRepository.create(dto);
  return salonRepository.save(salon);
}

export async function actualizarSalon(id: string, dto: ActualizarSalonDto): Promise<Salon> {
  const salon = await obtenerSalon(id);

  if (dto.nombre && dto.nombre !== salon.nombre) {
    const existente = await salonRepository.findOneBy({ nombre: dto.nombre });
    if (existente) {
      throw new HttpError(409, 'Ya existe un salón con ese nombre');
    }
  }

  Object.assign(salon, dto);
  return salonRepository.save(salon);
}

export async function eliminarSalon(id: string): Promise<void> {
  const salon = await obtenerSalon(id);
  const mesasEnEsteSalon = await mesaRepository.countBy({ salon: { id } });
  if (mesasEnEsteSalon > 0) {
    throw new HttpError(409, 'No se puede eliminar: hay mesas en este salón');
  }
  await salonRepository.remove(salon);
}
