import { HttpError } from '../../utils/http-error';
import { clienteRepository } from '../clientes/cliente.repository';
import { mesaRepository } from '../mesas/mesa.repository';
import { obtenerConfiguracion } from '../configuracion/configuracion.service';
import { reservaRepository } from './reserva.repository';
import { EstadoReserva, Reserva } from './reserva.entity';
import type { ActualizarReservaDto, CrearReservaDto } from './reserva.dto';
import type { Cliente } from '../clientes/cliente.entity';
import type { Mesa } from '../mesas/mesa.entity';

const RELACIONES = { cliente: true, mesa: { salon: true } } as const;
const ESTADOS_ACTIVOS = [EstadoReserva.PENDIENTE, EstadoReserva.CONFIRMADA];

export async function listarReservas(): Promise<Reserva[]> {
  return reservaRepository.find({ relations: RELACIONES, order: { fechaHora: 'ASC' } });
}

export async function obtenerReserva(id: string): Promise<Reserva> {
  const reserva = await reservaRepository.findOne({ where: { id }, relations: RELACIONES });
  if (!reserva) {
    throw new HttpError(404, 'Reserva no encontrada');
  }
  return reserva;
}

async function resolverCliente(clienteId: string): Promise<Cliente> {
  const cliente = await clienteRepository.findOneBy({ id: clienteId });
  if (!cliente) {
    throw new HttpError(400, 'El cliente indicado no existe', ['clienteId inválido']);
  }
  if (!cliente.activo) {
    throw new HttpError(400, 'El cliente indicado está inactivo');
  }
  return cliente;
}

async function resolverMesa(mesaId: string): Promise<Mesa> {
  const mesa = await mesaRepository.findOneBy({ id: mesaId });
  if (!mesa) {
    throw new HttpError(400, 'La mesa indicada no existe', ['mesaId inválido']);
  }
  if (!mesa.activo) {
    throw new HttpError(400, 'La mesa indicada está inactiva');
  }
  return mesa;
}

function validarCapacidad(mesa: Mesa, cantidadPersonas: number): void {
  if (cantidadPersonas > mesa.capacidad) {
    throw new HttpError(
      400,
      `La mesa ${mesa.numero} tiene capacidad para ${mesa.capacidad} personas`,
      ['cantidadPersonas excede la capacidad de la mesa'],
    );
  }
}

function validarFechaFutura(fechaHora: Date): void {
  if (fechaHora.getTime() < Date.now()) {
    throw new HttpError(400, 'La fecha y hora de la reserva debe ser futura');
  }
}

async function validarSinSolapamiento(
  mesaId: string,
  fechaHora: Date,
  duracionMinutos: number,
  idExcluir?: string,
): Promise<void> {
  const fin = new Date(fechaHora.getTime() + duracionMinutos * 60_000);

  const query = reservaRepository
    .createQueryBuilder('reserva')
    .where('reserva.mesa_id = :mesaId', { mesaId })
    .andWhere('reserva.estado IN (:...estados)', { estados: ESTADOS_ACTIVOS })
    .andWhere('reserva.fecha_hora < :fin', { fin })
    .andWhere("reserva.fecha_hora + (reserva.duracion_minutos || ' minutes')::interval > :inicio", {
      inicio: fechaHora,
    });

  if (idExcluir) {
    query.andWhere('reserva.id != :idExcluir', { idExcluir });
  }

  const conflicto = await query.getOne();
  if (conflicto) {
    throw new HttpError(409, 'Ya existe una reserva para esa mesa en ese horario');
  }
}

export async function crearReserva(dto: CrearReservaDto): Promise<Reserva> {
  const cliente = await resolverCliente(dto.clienteId);
  const mesa = await resolverMesa(dto.mesaId);
  const fechaHora = new Date(dto.fechaHora);
  // El valor por defecto sale de la configuración del restaurante (FASE 21): una
  // cevichería y una pollería no ocupan la mesa el mismo tiempo.
  const duracionMinutos =
    dto.duracionMinutos ?? (await obtenerConfiguracion()).duracionReservaMinutos;

  validarFechaFutura(fechaHora);
  validarCapacidad(mesa, dto.cantidadPersonas);
  await validarSinSolapamiento(dto.mesaId, fechaHora, duracionMinutos);

  const reserva = reservaRepository.create({
    cliente,
    mesa,
    fechaHora,
    duracionMinutos,
    cantidadPersonas: dto.cantidadPersonas,
    notas: dto.notas ?? null,
  });
  const guardada = await reservaRepository.save(reserva);
  return obtenerReserva(guardada.id);
}

export async function actualizarReserva(id: string, dto: ActualizarReservaDto): Promise<Reserva> {
  const reserva = await obtenerReserva(id);

  if (dto.clienteId) {
    reserva.cliente = await resolverCliente(dto.clienteId);
  }
  if (dto.mesaId) {
    reserva.mesa = await resolverMesa(dto.mesaId);
  }
  if (dto.fechaHora !== undefined) {
    reserva.fechaHora = new Date(dto.fechaHora);
    validarFechaFutura(reserva.fechaHora);
  }
  if (dto.duracionMinutos !== undefined) {
    reserva.duracionMinutos = dto.duracionMinutos;
  }
  if (dto.cantidadPersonas !== undefined) {
    reserva.cantidadPersonas = dto.cantidadPersonas;
  }

  if (dto.mesaId || dto.fechaHora !== undefined || dto.duracionMinutos !== undefined) {
    validarCapacidad(reserva.mesa, reserva.cantidadPersonas);
    if (reserva.estado === EstadoReserva.PENDIENTE || reserva.estado === EstadoReserva.CONFIRMADA) {
      await validarSinSolapamiento(reserva.mesa.id, reserva.fechaHora, reserva.duracionMinutos, id);
    }
  }

  if (dto.estado !== undefined) reserva.estado = dto.estado;
  if (dto.notas !== undefined) reserva.notas = dto.notas;

  await reservaRepository.save(reserva);
  return obtenerReserva(id);
}

export async function cancelarReserva(id: string): Promise<void> {
  const reserva = await obtenerReserva(id);
  reserva.estado = EstadoReserva.CANCELADA;
  await reservaRepository.save(reserva);
}
