import { HttpError } from '../../utils/http-error';
import { salonRepository } from '../salones/salon.repository';
import { mesaRepository } from './mesa.repository';
import type { ActualizarMesaDto, CrearMesaDto } from './mesa.dto';
import type { Mesa } from './mesa.entity';

const RELACIONES = { salon: true } as const;

export async function listarMesas(): Promise<Mesa[]> {
  return mesaRepository.find({ relations: RELACIONES, order: { numero: 'ASC' } });
}

export async function obtenerMesa(id: string): Promise<Mesa> {
  const mesa = await mesaRepository.findOne({ where: { id }, relations: RELACIONES });
  if (!mesa) {
    throw new HttpError(404, 'Mesa no encontrada');
  }
  return mesa;
}

async function resolverSalon(salonId: string) {
  const salon = await salonRepository.findOneBy({ id: salonId });
  if (!salon) {
    throw new HttpError(400, 'El salón indicado no existe', ['salonId inválido']);
  }
  return salon;
}

async function verificarNumeroDisponible(
  salonId: string,
  numero: string,
  idExcluido?: string,
): Promise<void> {
  const existente = await mesaRepository.findOne({
    where: { salon: { id: salonId }, numero },
    relations: RELACIONES,
  });
  if (existente && existente.id !== idExcluido) {
    throw new HttpError(409, 'Ya existe una mesa con ese número en el salón indicado');
  }
}

export async function crearMesa(dto: CrearMesaDto): Promise<Mesa> {
  const salon = await resolverSalon(dto.salonId);
  await verificarNumeroDisponible(dto.salonId, dto.numero);

  const mesa = mesaRepository.create({
    salon,
    numero: dto.numero,
    capacidad: dto.capacidad,
  });
  const guardada = await mesaRepository.save(mesa);
  return obtenerMesa(guardada.id);
}

export async function actualizarMesa(id: string, dto: ActualizarMesaDto): Promise<Mesa> {
  const mesa = await obtenerMesa(id);

  const salonId = dto.salonId ?? mesa.salon.id;
  const numero = dto.numero ?? mesa.numero;
  if (dto.salonId || dto.numero) {
    await verificarNumeroDisponible(salonId, numero, id);
  }

  if (dto.salonId) {
    mesa.salon = await resolverSalon(dto.salonId);
  }
  if (dto.numero !== undefined) mesa.numero = dto.numero;
  if (dto.capacidad !== undefined) mesa.capacidad = dto.capacidad;
  if (dto.activo !== undefined) mesa.activo = dto.activo;

  await mesaRepository.save(mesa);
  return obtenerMesa(id);
}

export async function eliminarMesa(id: string): Promise<void> {
  const mesa = await obtenerMesa(id);
  await mesaRepository.remove(mesa);
}
