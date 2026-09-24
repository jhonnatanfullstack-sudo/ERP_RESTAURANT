import { HttpError } from '../../utils/http-error';
import { mesaRepository } from '../mesas/mesa.repository';
import { productoRepository } from '../productos/producto.repository';
import { clienteRepository } from '../clientes/cliente.repository';
import { reservaRepository } from '../reservas/reserva.repository';
import { EstadoReserva } from '../reservas/reserva.entity';
import { ventaRepository } from '../ventas/venta.repository';
import { existeComandaActivaParaPedido } from '../cocina/comanda.service';
import { crearNotificacion } from '../notificaciones/notificacion.service';
import { TipoNotificacion } from '../notificaciones/notificacion.entity';
import { detallePedidoRepository, pedidoRepository } from './pedido.repository';
import { CanalOrigenPedido, EstadoPedido, Pedido } from './pedido.entity';
import { DetallePedido } from './detalle-pedido.entity';
import type {
  ActualizarDetalleDto,
  ActualizarPedidoDto,
  AgregarDetalleDto,
  CrearPedidoDto,
  CrearPedidoPublicoDto,
} from './pedido.dto';
import type { Mesa } from '../mesas/mesa.entity';
import type { Producto } from '../productos/producto.entity';
import type { Cliente } from '../clientes/cliente.entity';
import type { Reserva } from '../reservas/reserva.entity';

const RELACIONES = {
  mesa: { salon: true },
  cliente: true,
  detalles: { producto: true, comanda: true },
} as const;

const ESTADOS_RESERVA_ACTIVOS = [EstadoReserva.PENDIENTE, EstadoReserva.CONFIRMADA];

const formateadorHora = new Intl.DateTimeFormat('es-PE', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Lima',
});

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

/** Reserva pendiente/confirmada cuyo rango [fechaHora, fechaHora+duracionMinutos) cubre el
 * momento actual — es decir, la mesa está "reservada" en este instante para ese cliente. */
async function obtenerReservaActivaDeMesa(mesaId: string): Promise<Reserva | null> {
  const ahora = new Date();
  return reservaRepository
    .createQueryBuilder('reserva')
    .leftJoinAndSelect('reserva.cliente', 'cliente')
    .where('reserva.mesa_id = :mesaId', { mesaId })
    .andWhere('reserva.estado IN (:...estados)', { estados: ESTADOS_RESERVA_ACTIVOS })
    .andWhere('reserva.fecha_hora <= :ahora', { ahora })
    .andWhere("reserva.fecha_hora + (reserva.duracion_minutos || ' minutes')::interval > :ahora", {
      ahora,
    })
    .getOne();
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
  // Sin mesaId el pedido es "para llevar": no hay mesa que ocupar ni reserva que chocar,
  // así que las validaciones de esta sección solo corren cuando sí se indicó una mesa.
  let mesa: Mesa | null = null;
  let reservaActiva: Reserva | null = null;

  if (dto.mesaId) {
    mesa = await resolverMesa(dto.mesaId);

    const pedidoAbierto = await pedidoRepository.findOneBy({
      mesa: { id: mesa.id },
      estado: EstadoPedido.ABIERTO,
    });
    if (pedidoAbierto) {
      throw new HttpError(409, 'La mesa ya tiene un pedido abierto');
    }

    reservaActiva = await obtenerReservaActivaDeMesa(mesa.id);
  }

  let cliente: Cliente | null = null;
  if (dto.clienteId) {
    cliente = await resolverCliente(dto.clienteId);
  }

  if (reservaActiva && reservaActiva.cliente.id !== dto.clienteId) {
    const hora = formateadorHora.format(reservaActiva.fechaHora);
    throw new HttpError(
      409,
      `La mesa está reservada para ${reservaActiva.cliente.nombres} ${reservaActiva.cliente.apellidos ?? ''}`.trim() +
        ` a las ${hora}`,
      ['La mesa tiene una reserva activa de otro cliente'],
    );
  }

  const pedido = pedidoRepository.create({ mesa, cliente, notas: dto.notas ?? null });
  const guardado = await pedidoRepository.save(pedido);
  return obtenerPedido(guardado.id);
}

/**
 * Pedido que arma el propio cliente desde la carta pública (autopedido en mesa, delivery o
 * recojo), sin autenticarse — ver `carta-publica.controller.ts`. Queda tan "abierto" como uno
 * de salón: un mesero lo revisa y recién ahí lo envía a cocina (`POST /api/comandas`, que
 * sigue exigiendo sesión), así que un aluvión de autopedidos falsos no llega solo a la cocina.
 *
 * En autopedido, si la mesa ya tiene un AUTOPEDIDO abierto (alguien pidió antes en la misma
 * sesión de mesa), las líneas nuevas se agregan a ESE pedido en vez de fallar con "la mesa ya
 * tiene un pedido abierto": es el caso normal de "pedir algo más" a mitad de la comida, no un
 * conflicto. Delivery/recojo, al no tener mesa, siempre crean un pedido nuevo.
 *
 * H04: si la mesa tiene un pedido abierto de OTRO canal (típicamente `SALON`, abierto por un
 * mesero autenticado, posiblemente con un `cliente` asociado), la petición se RECHAZA — nunca
 * se reutiliza ni se le agregan líneas. Antes de este cambio, `findOneBy` no filtraba por
 * `canalOrigen`, así que un tercero sin autenticarse podía terminar agregando líneas al pedido
 * de un mesero y recibiendo esa entidad completa (con su `cliente`) en la respuesta.
 */
const ETIQUETA_CANAL_ORIGEN: Record<CanalOrigenPedido, string> = {
  [CanalOrigenPedido.SALON]: 'Salón',
  [CanalOrigenPedido.AUTOPEDIDO]: 'Autopedido',
  [CanalOrigenPedido.DELIVERY]: 'Delivery',
  [CanalOrigenPedido.RECOJO]: 'Recojo',
};

/** Mensaje deliberadamente genérico: no debe filtrar el id del pedido ajeno, el id del cliente
 * asociado, el canal interno que lo abrió, ni el nombre de quien lo atiende. */
const MENSAJE_MESA_ATENDIDA_POR_OTRO_CANAL =
  'La mesa ya está siendo atendida. Solicita ayuda al personal.';

export async function crearPedidoPublico(dto: CrearPedidoPublicoDto): Promise<Pedido> {
  let pedido: Pedido;
  // Solo se avisa al equipo cuando nace un pedido de verdad: agregar un plato más a un
  // autopedido que ya estaba abierto es "pedir algo más", no una orden nueva que alguien deba
  // notar y atender (ver el comentario grande más abajo sobre por qué se reusa el abierto).
  let esPedidoNuevo = true;

  if (dto.canalOrigen === CanalOrigenPedido.AUTOPEDIDO) {
    const mesa = await resolverMesa(dto.mesaId!);

    // Se traen TODOS los pedidos abiertos de la mesa (no el primero que devuelva la consulta)
    // para distinguir sin ambigüedad los tres casos posibles — incluido el estado inconsistente
    // que H12 todavía no impide a nivel de base de datos: más de un pedido abierto a la vez en
    // la misma mesa (ej. un AUTOPEDIDO y un SALON simultáneos por una carrera). Ese caso NO se
    // resuelve aquí (no es responsabilidad de H04 elegir cuál de los dos es el "correcto"): se
    // trata igual que "hay un pedido de otro canal" y se rechaza.
    const pedidosAbiertosEnMesa = await pedidoRepository.findBy({
      mesa: { id: mesa.id },
      estado: EstadoPedido.ABIERTO,
    });
    const autopedidoAbierto = pedidosAbiertosEnMesa.find(
      (p) => p.canalOrigen === CanalOrigenPedido.AUTOPEDIDO,
    );
    const hayOtroCanalAbierto = pedidosAbiertosEnMesa.some(
      (p) => p.canalOrigen !== CanalOrigenPedido.AUTOPEDIDO,
    );

    if (hayOtroCanalAbierto) {
      throw new HttpError(409, MENSAJE_MESA_ATENDIDA_POR_OTRO_CANAL);
    }

    esPedidoNuevo = !autopedidoAbierto;
    pedido =
      autopedidoAbierto ??
      (await pedidoRepository.save(
        pedidoRepository.create({
          mesa,
          canalOrigen: dto.canalOrigen,
          contactoNombre: dto.contactoNombre ?? null,
          medioPagoPreferido: dto.medioPagoPreferido ?? null,
          vueltoPara: dto.vueltoPara ?? null,
          notas: dto.notas ?? null,
        }),
      ));
  } else {
    pedido = await pedidoRepository.save(
      pedidoRepository.create({
        mesa: null,
        canalOrigen: dto.canalOrigen,
        contactoNombre: dto.contactoNombre ?? null,
        contactoTelefono: dto.contactoTelefono ?? null,
        direccionEntrega:
          dto.canalOrigen === CanalOrigenPedido.DELIVERY ? (dto.direccionEntrega ?? null) : null,
        medioPagoPreferido: dto.medioPagoPreferido ?? null,
        vueltoPara: dto.vueltoPara ?? null,
        notas: dto.notas ?? null,
      }),
    );
  }

  for (const linea of dto.detalles) {
    await agregarDetalle(pedido.id, linea);
  }

  const pedidoCompleto = await obtenerPedido(pedido.id);

  if (esPedidoNuevo) {
    const origen = pedidoCompleto.mesa
      ? `${pedidoCompleto.mesa.salon.nombre} — Mesa ${pedidoCompleto.mesa.numero}`
      : ETIQUETA_CANAL_ORIGEN[dto.canalOrigen];
    await crearNotificacion({
      tipo: TipoNotificacion.PEDIDO_NUEVO,
      titulo: `Nuevo pedido — ${ETIQUETA_CANAL_ORIGEN[dto.canalOrigen]}`,
      mensaje: origen,
      entidadTipo: 'pedido',
      entidadId: pedidoCompleto.id,
    });
  }

  return pedidoCompleto;
}

/**
 * Reabre un pedido cerrado por error (ej. faltaba agregar un plato). Dos condiciones lo
 * bloquean, cada una porque dejaría una inconsistencia real si se ignorara:
 *
 * 1. **Ya tiene una venta.** El comprobante es un snapshot de las líneas del pedido en el
 *    momento de facturar (`venta.service.ts: construirDesdePedido`); si el pedido volviera a
 *    `abierto` y alguien le agregara o quitara líneas, ese snapshot dejaría de coincidir con
 *    lo que el pedido dice tener — la venta ya emitida es la fuente de verdad legal, no el
 *    pedido.
 * 2. **Su mesa ya tiene otro pedido abierto.** Cerrar deja la mesa "libre" en la vista
 *    derivada de ocupación (`Mesas.tsx`), y nada impide que mientras tanto alguien haya
 *    sentado otra mesa ahí y abierto un pedido nuevo. Reabrir el viejo sin este chequeo
 *    rompería la regla de "un pedido abierto por mesa" que `crearPedido` sí garantiza.
 */
async function reabrirPedido(pedido: Pedido): Promise<void> {
  const ventaExistente = await ventaRepository.findOneBy({ pedido: { id: pedido.id } });
  if (ventaExistente) {
    throw new HttpError(
      409,
      'Este pedido ya tiene una venta registrada: no se puede reabrir. Corrígelo con una Nota de Crédito o Débito.',
    );
  }

  if (pedido.mesa) {
    const otroAbierto = await pedidoRepository.findOneBy({
      mesa: { id: pedido.mesa.id },
      estado: EstadoPedido.ABIERTO,
    });
    if (otroAbierto) {
      throw new HttpError(
        409,
        'La mesa de este pedido ya tiene otro pedido abierto: no se puede reabrir este.',
      );
    }
  }

  pedido.estado = EstadoPedido.ABIERTO;
  pedido.fechaCierre = null;
}

export async function actualizarPedido(id: string, dto: ActualizarPedidoDto): Promise<Pedido> {
  const pedido = await obtenerPedido(id);

  if (dto.notas !== undefined) {
    pedido.notas = dto.notas;
  }

  if (dto.estado !== undefined && dto.estado !== pedido.estado) {
    if (dto.estado === EstadoPedido.CERRADO && pedido.estado === EstadoPedido.ABIERTO) {
      const cantidadDetalles = await detallePedidoRepository.countBy({ pedido: { id } });
      if (cantidadDetalles === 0) {
        throw new HttpError(400, 'No se puede cerrar un pedido sin productos');
      }
      if (await existeComandaActivaParaPedido(id)) {
        throw new HttpError(400, 'No se puede cerrar un pedido con comandas aún no entregadas');
      }
      pedido.estado = EstadoPedido.CERRADO;
      pedido.fechaCierre = new Date();
    } else if (dto.estado === EstadoPedido.ABIERTO && pedido.estado === EstadoPedido.CERRADO) {
      // Reabrir corrige un cierre por error ("se cerró y faltaba agregar algo"). Dos
      // guardas para que no quede una inconsistencia detrás:
      await reabrirPedido(pedido);
    } else {
      // Un pedido `cancelado` nunca se reabre (a propósito: cancelar es intencional, no un
      // error de un clic como cerrar), y ninguna otra combinación tiene sentido de negocio.
      throw new HttpError(400, 'Transición de estado no permitida');
    }
  }

  await pedidoRepository.save(pedido);
  return obtenerPedido(id);
}

export async function cancelarPedido(id: string): Promise<void> {
  const pedido = await obtenerPedidoActivo(id);
  if (await existeComandaActivaParaPedido(id)) {
    throw new HttpError(400, 'No se puede cancelar un pedido con comandas aún no entregadas');
  }
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
    relations: { comanda: true },
  });
  if (!detalle) {
    throw new HttpError(404, 'El producto indicado no pertenece a este pedido');
  }
  return detalle;
}

function validarNoEnviadoACocina(detalle: DetallePedido): void {
  if (detalle.comanda) {
    throw new HttpError(400, 'No se puede modificar un producto ya enviado a cocina');
  }
}

export async function actualizarDetalle(
  pedidoId: string,
  detalleId: string,
  dto: ActualizarDetalleDto,
): Promise<DetallePedido> {
  await obtenerPedidoActivo(pedidoId);
  const detalle = await obtenerDetalleDelPedido(pedidoId, detalleId);
  validarNoEnviadoACocina(detalle);

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
  validarNoEnviadoACocina(detalle);
  await detallePedidoRepository.remove(detalle);
  await recalcularTotal(pedidoId);
}
