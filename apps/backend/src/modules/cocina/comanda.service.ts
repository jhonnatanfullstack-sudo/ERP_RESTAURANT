import { In } from 'typeorm';
import { HttpError } from '../../utils/http-error';
import { alConfirmar, empresaIdActual } from '../../database/tenant-context';
import { emitirAEmpresa } from '../../realtime/socket';
import { detallePedidoRepository, pedidoRepository } from '../pedidos/pedido.repository';
import { EstadoPedido } from '../pedidos/pedido.entity';
import { registrarConsumoComanda } from '../inventario/existencia.service';
import { crearNotificacion } from '../notificaciones/notificacion.service';
import { TipoNotificacion } from '../notificaciones/notificacion.entity';
import { comandaRepository } from './comanda.repository';
import { Comanda, EstadoComanda } from './comanda.entity';
import type { ActualizarEstadoComandaDto, CrearComandaDto } from './comanda.dto';

/** Avisa a las pantallas de cocina de esta empresa que algo cambió, para que se actualicen al
 * instante en vez de esperar el próximo sondeo. Ver `realtime/socket.ts`.
 *
 * Va encolado con `alConfirmar` (no se emite de inmediato): esta función corre todavía dentro
 * de la transacción de la petición, y un error más adelante en esa misma petición podría
 * revertir el cambio con un rollback — emitir antes le habría contado a las pantallas de
 * cocina algo que nunca llegó a pasar. `empresaId` se captura ahora (con la petición todavía
 * en curso) porque `alConfirmar` corre el callback después, cuando ya no hay contexto de
 * empresa del que leerlo. */
function notificarCambio(comanda: Comanda): void {
  const empresaId = empresaIdActual();
  alConfirmar(() => emitirAEmpresa(empresaId, 'cocina:comanda-actualizada', comanda));
}

/** "Salón — Mesa 5" o "Para llevar" — mismo criterio que `nombreMesa` del frontend
 * (`utils/formato.ts`), pero del lado del servidor para el texto de la notificación. */
function nombreMesa(comanda: Comanda): string {
  const mesa = comanda.pedido.mesa;
  return mesa ? `${mesa.salon.nombre} — Mesa ${mesa.numero}` : 'Para llevar';
}

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

/** Un paso hacia atrás, para corregir un toque de más en la pantalla de cocina (ej. marcar
 * "listo" por error). Se detiene en `entregado`: ahí ya se descontó el insumo de la receta
 * (`registrarConsumoComanda`), y retroceder tendría que revertir ese consumo también —
 * bastante distinto de simplemente "deshacer un clic", así que queda fuera a propósito. */
const ESTADO_ANTERIOR: Partial<Record<EstadoComanda, EstadoComanda>> = {
  [EstadoComanda.EN_PREPARACION]: EstadoComanda.PENDIENTE,
  [EstadoComanda.LISTO]: EstadoComanda.EN_PREPARACION,
};

/** Estados desde los que todavía se puede cancelar sin deshacer nada: antes de `listo` no se
 * registró ningún consumo de insumos (eso ocurre recién en `entregado`), así que cancelar acá
 * no descuadra el inventario. Antes solo se permitía desde `pendiente` — si el cliente se
 * arrepentía a mitad de la preparación, la única salida era marcarla "entregado" igual,
 * descontando insumos de un plato que nunca se sirvió. */
const ESTADOS_CANCELABLES = [EstadoComanda.PENDIENTE, EstadoComanda.EN_PREPARACION];

function ordenarDetalles(comanda: Comanda): Comanda {
  comanda.detalles.sort((a, b) => a.creadoEn.getTime() - b.creadoEn.getTime());
  return comanda;
}

interface FiltroListarComandas {
  estado?: EstadoComanda;
  /** El tablero en vivo de cocina (`Cocina.tsx`) sondea este endpoint cada pocos segundos
   * para siempre — sin este filtro, cada sondeo traía la historia COMPLETA de comandas del
   * restaurante (meses de entregadas y canceladas), cuando la pantalla solo necesita las tres
   * activas para dibujar el tablero. El historial ("Todas") sigue pudiendo pedir todo. */
  soloActivas?: boolean;
}

export async function listarComandas(filtro: FiltroListarComandas = {}): Promise<Comanda[]> {
  const comandas = await comandaRepository.find({
    where: filtro.soloActivas
      ? { estado: In(ESTADOS_ACTIVOS) }
      : filtro.estado
        ? { estado: filtro.estado }
        : {},
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

  // El UPDATE lleva su propia condición `comanda_id IS NULL`, no solo el chequeo de arriba:
  // dos meseros enviando la misma línea casi a la vez podrían pasar ambos el chequeo en JS
  // antes de que cualquiera hubiera escrito nada — el filtro de arriba deja el error claro en
  // el caso común, esta condición es la que de verdad impide que la línea quede en dos
  // comandas. Si el número de filas afectadas no coincide con lo pedido, alguien más se
  // adelantó entre el chequeo y este UPDATE.
  const resultado = await detallePedidoRepository
    .createQueryBuilder()
    .update()
    .set({ comanda: guardada })
    .where('id IN (:...ids)', { ids: dto.detalleIds })
    .andWhere('comanda_id IS NULL')
    .execute();
  if (resultado.affected !== dto.detalleIds.length) {
    throw new HttpError(409, 'Uno o más productos ya fueron enviados a cocina por otra comanda');
  }

  const comandaCompleta = await obtenerComanda(guardada.id);
  notificarCambio(comandaCompleta);
  return comandaCompleta;
}

export async function actualizarEstadoComanda(
  id: string,
  dto: ActualizarEstadoComandaDto,
): Promise<Comanda> {
  const comanda = await obtenerComanda(id);
  const siguienteEsperado = SIGUIENTE_ESTADO[comanda.estado];
  const anteriorEsperado = ESTADO_ANTERIOR[comanda.estado];
  const esAvance = dto.estado === siguienteEsperado;
  const esRetroceso = dto.estado === anteriorEsperado;
  if (!esAvance && !esRetroceso) {
    throw new HttpError(400, 'Transición de estado no permitida');
  }
  comanda.estado = dto.estado;
  await comandaRepository.save(comanda);

  // El consumo real de insumos ocurre aquí, no al facturar: es el momento en que el platillo
  // físicamente se preparó y salió de cocina (ver existencia.service.ts).
  if (dto.estado === EstadoComanda.ENTREGADO) {
    await registrarConsumoComanda(comanda);
  }

  const comandaActualizada = await obtenerComanda(id);
  notificarCambio(comandaActualizada);

  if (dto.estado === EstadoComanda.LISTO) {
    await crearNotificacion({
      tipo: TipoNotificacion.COMANDA_LISTA,
      titulo: 'Comanda lista',
      mensaje: `${nombreMesa(comandaActualizada)} — lista para entregar`,
      entidadTipo: 'comanda',
      entidadId: comandaActualizada.id,
    });
  }

  return comandaActualizada;
}

export async function cancelarComanda(id: string): Promise<void> {
  const comanda = await obtenerComanda(id);
  if (!ESTADOS_CANCELABLES.includes(comanda.estado)) {
    throw new HttpError(
      400,
      'Solo se puede cancelar una comanda que todavía no está lista para entregar',
    );
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

  notificarCambio(comanda);
}
