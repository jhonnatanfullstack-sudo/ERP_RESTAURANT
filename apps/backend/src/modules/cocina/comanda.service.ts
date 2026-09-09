import { In } from 'typeorm';
import { HttpError } from '../../utils/http-error';
import { detallePedidoRepository, pedidoRepository } from '../pedidos/pedido.repository';
import { EstadoPedido } from '../pedidos/pedido.entity';
import { registrarConsumoComanda } from '../inventario/existencia.service';
import { comandaRepository } from './comanda.repository';
import { Comanda, EstadoComanda } from './comanda.entity';
import type { ActualizarEstadoComandaDto, CrearComandaDto } from './comanda.dto';

const RELACIONES = { pedido: { mesa: { salon: true } }, detalles: { producto: true } } as const;

const ESTADOS_ACTIVOS = [
  EstadoComanda.PENDIENTE,
  EstadoComanda.EN_PREPARACION,
  EstadoComanda.LISTO,
];

const SIGUIENTE_ESTADO: Partial<Record<EstadoComanda, EstadoComanda>> = {
  [EstadoComanda.PENDIENTE]: EstadoComanda.EN_PREPARACION,
  [EstadoComanda.EN_PREPARACION]: EstadoComanda.LISTO,
  [EstadoComanda.LISTO]: EstadoComanda.ENTREGADO,
};

function ordenarDetalles(comanda: Comanda): Comanda {
  comanda.detalles.sort((a, b) => a.creadoEn.getTime() - b.creadoEn.getTime());
  return comanda;
}

export async function listarComandas(estado?: EstadoComanda): Promise<Comanda[]> {
  const comandas = await comandaRepository.find({
    where: estado ? { estado } : {},
    relations: RELACIONES,
    order: { creadoEn: 'ASC' },
  });
  return comandas.map(ordenarDetalles);
}

export async function obtenerComanda(id: string): Promise<Comanda> {
  const comanda = await comandaRepository.findOne({ where: { id }, relations: RELACIONES });
  if (!comanda) {
    throw new HttpError(404, 'Comanda no encontrada');
  }
  return ordenarDetalles(comanda);
}

/** Usado por Pedidos para bloquear cerrar/cancelar un pedido mientras la cocina
 * todavía tiene algo pendiente, en preparación o listo para entregar. */
export async function existeComandaActivaParaPedido(pedidoId: string): Promise<boolean> {
  const cantidad = await comandaRepository.countBy({
    pedido: { id: pedidoId },
    estado: In(ESTADOS_ACTIVOS),
  });
  return cantidad > 0;
}

export async function crearComanda(dto: CrearComandaDto): Promise<Comanda> {
  const pedido = await pedidoRepository.findOneBy({ id: dto.pedidoId });
  if (!pedido) {
    throw new HttpError(400, 'El pedido indicado no existe', ['pedidoId inválido']);
  }
  if (pedido.estado !== EstadoPedido.ABIERTO) {
    throw new HttpError(400, 'El pedido ya está cerrado o cancelado');
  }

  const detalles = await detallePedidoRepository.find({
    where: { id: In(dto.detalleIds) },
    relations: { pedido: true, comanda: true },
  });
  if (detalles.length !== dto.detalleIds.length) {
    throw new HttpError(400, 'Uno o más productos indicados no existen', ['detalleIds inválido']);
  }
  if (detalles.some((detalle) => detalle.pedido.id !== dto.pedidoId)) {
    throw new HttpError(400, 'Uno o más productos no pertenecen a este pedido');
  }
  if (detalles.some((detalle) => detalle.comanda !== null)) {
    throw new HttpError(409, 'Uno o más productos ya fueron enviados a cocina');
  }

  const comanda = comandaRepository.create({ pedido, notas: dto.notas ?? null });
  const guardada = await comandaRepository.save(comanda);

  detalles.forEach((detalle) => {
    detalle.comanda = guardada;
  });
  await detallePedidoRepository.save(detalles);

  return obtenerComanda(guardada.id);
}

export async function actualizarEstadoComanda(
  id: string,
  dto: ActualizarEstadoComandaDto,
): Promise<Comanda> {
  const comanda = await obtenerComanda(id);
  const siguienteEsperado = SIGUIENTE_ESTADO[comanda.estado];
  if (!siguienteEsperado || dto.estado !== siguienteEsperado) {
    throw new HttpError(400, 'Transición de estado no permitida');
  }
  comanda.estado = dto.estado;
  await comandaRepository.save(comanda);

  // El consumo real de insumos ocurre aquí, no al facturar: es el momento en que el platillo
  // físicamente se preparó y salió de cocina (ver existencia.service.ts).
  if (dto.estado === EstadoComanda.ENTREGADO) {
    await registrarConsumoComanda(comanda);
  }

  return obtenerComanda(id);
}

export async function cancelarComanda(id: string): Promise<void> {
  const comanda = await obtenerComanda(id);
  if (comanda.estado !== EstadoComanda.PENDIENTE) {
    throw new HttpError(400, 'Solo se puede cancelar una comanda que aún no empezó a prepararse');
  }
  comanda.estado = EstadoComanda.CANCELADA;
  await comandaRepository.save(comanda);

  // Libera las líneas para que puedan editarse/quitarse o enviarse en otra comanda.
  await detallePedidoRepository
    .createQueryBuilder()
    .update()
    .set({ comanda: null })
    .where('comanda_id = :id', { id })
    .execute();
}
