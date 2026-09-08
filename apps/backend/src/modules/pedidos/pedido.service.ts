import { HttpError } from '../../utils/http-error';
import { mesaRepository } from '../mesas/mesa.repository';
import { productoRepository } from '../productos/producto.repository';
import { detallePedidoRepository, pedidoRepository } from './pedido.repository';
import { EstadoPedido, Pedido } from './pedido.entity';
import { DetallePedido } from './detalle-pedido.entity';
import type {
  ActualizarDetalleDto,
  ActualizarPedidoDto,
  AgregarDetalleDto,
  CrearPedidoDto,
} from './pedido.dto';
import type { Mesa } from '../mesas/mesa.entity';
import type { Producto } from '../productos/producto.entity';

const RELACIONES = { mesa: { salon: true }, detalles: { producto: true } } as const;

export async function listarPedidos(estado?: EstadoPedido): Promise<Pedido[]> {
  return pedidoRepository.find({
    where: estado ? { estado } : {},
    relations: RELACIONES,
    order: { creadoEn: 'DESC' },
  });
}

export async function obtenerPedido(id: string): Promise<Pedido> {
  const pedido = await pedidoRepository.findOne({ where: { id }, relations: RELACIONES });
  if (!pedido) {
    throw new HttpError(404, 'Pedido no encontrado');
  }
  // Postgres no garantiza el orden de un SELECT sin ORDER BY: una fila editada
  // (UPDATE reescribe la tupla) puede "saltar" de posición aunque su creado_en
  // no cambie. Se ordena explícitamente para que las líneas del pedido se vean
  // siempre en el orden en que se agregaron.
  pedido.detalles.sort((a, b) => a.creadoEn.getTime() - b.creadoEn.getTime());
  return pedido;
}

async function obtenerPedidoActivo(id: string): Promise<Pedido> {
  const pedido = await obtenerPedido(id);
  if (pedido.estado !== EstadoPedido.ABIERTO) {
    throw new HttpError(400, 'El pedido ya está cerrado o cancelado');
  }
  return pedido;
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

async function resolverProducto(productoId: string): Promise<Producto> {
  const producto = await productoRepository.findOneBy({ id: productoId });
  if (!producto) {
    throw new HttpError(400, 'El producto indicado no existe', ['productoId inválido']);
  }
  if (!producto.activo) {
    throw new HttpError(400, 'El producto indicado está inactivo');
  }
  return producto;
}

async function recalcularTotal(pedidoId: string): Promise<void> {
  const detalles = await detallePedidoRepository.findBy({ pedido: { id: pedidoId } });
  const total = detalles.reduce((suma, detalle) => suma + detalle.subtotal, 0);
  await pedidoRepository.update(pedidoId, { total });
}

export async function crearPedido(dto: CrearPedidoDto): Promise<Pedido> {
  const mesa = await resolverMesa(dto.mesaId);

  const pedidoAbierto = await pedidoRepository.findOneBy({
    mesa: { id: mesa.id },
    estado: EstadoPedido.ABIERTO,
  });
  if (pedidoAbierto) {
    throw new HttpError(409, 'La mesa ya tiene un pedido abierto');
  }

  const pedido = pedidoRepository.create({ mesa, notas: dto.notas ?? null });
  const guardado = await pedidoRepository.save(pedido);
  return obtenerPedido(guardado.id);
}

export async function actualizarPedido(id: string, dto: ActualizarPedidoDto): Promise<Pedido> {
  const pedido = await obtenerPedido(id);

  if (dto.notas !== undefined) {
    pedido.notas = dto.notas;
  }

  if (dto.estado !== undefined && dto.estado !== pedido.estado) {
    if (dto.estado !== EstadoPedido.CERRADO || pedido.estado !== EstadoPedido.ABIERTO) {
      throw new HttpError(400, 'Transición de estado no permitida');
    }
    const cantidadDetalles = await detallePedidoRepository.countBy({ pedido: { id } });
    if (cantidadDetalles === 0) {
      throw new HttpError(400, 'No se puede cerrar un pedido sin productos');
    }
    pedido.estado = EstadoPedido.CERRADO;
    pedido.fechaCierre = new Date();
  }

  await pedidoRepository.save(pedido);
  return obtenerPedido(id);
}

export async function cancelarPedido(id: string): Promise<void> {
  const pedido = await obtenerPedidoActivo(id);
  pedido.estado = EstadoPedido.CANCELADO;
  pedido.fechaCierre = new Date();
  await pedidoRepository.save(pedido);
}

export async function agregarDetalle(
  pedidoId: string,
  dto: AgregarDetalleDto,
): Promise<DetallePedido> {
  await obtenerPedidoActivo(pedidoId);
  const producto = await resolverProducto(dto.productoId);

  const detalle = detallePedidoRepository.create({
    pedido: { id: pedidoId },
    producto,
    cantidad: dto.cantidad,
    precioUnitario: producto.precio,
    subtotal: producto.precio * dto.cantidad,
    notas: dto.notas ?? null,
  });
  const guardado = await detallePedidoRepository.save(detalle);
  await recalcularTotal(pedidoId);
  return guardado;
}

async function obtenerDetalleDelPedido(
  pedidoId: string,
  detalleId: string,
): Promise<DetallePedido> {
  const detalle = await detallePedidoRepository.findOne({
    where: { id: detalleId, pedido: { id: pedidoId } },
  });
  if (!detalle) {
    throw new HttpError(404, 'El producto indicado no pertenece a este pedido');
  }
  return detalle;
}

export async function actualizarDetalle(
  pedidoId: string,
  detalleId: string,
  dto: ActualizarDetalleDto,
): Promise<DetallePedido> {
  await obtenerPedidoActivo(pedidoId);
  const detalle = await obtenerDetalleDelPedido(pedidoId, detalleId);

  if (dto.cantidad !== undefined) {
    detalle.cantidad = dto.cantidad;
    detalle.subtotal = detalle.precioUnitario * dto.cantidad;
  }
  if (dto.notas !== undefined) {
    detalle.notas = dto.notas;
  }

  const guardado = await detallePedidoRepository.save(detalle);
  await recalcularTotal(pedidoId);
  return guardado;
}

export async function eliminarDetalle(pedidoId: string, detalleId: string): Promise<void> {
  await obtenerPedidoActivo(pedidoId);
  const detalle = await obtenerDetalleDelPedido(pedidoId, detalleId);
  await detallePedidoRepository.remove(detalle);
  await recalcularTotal(pedidoId);
}
