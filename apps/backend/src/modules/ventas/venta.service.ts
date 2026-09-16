import type { EntityManager } from 'typeorm';
import { enTransaccion } from '../../database/tenant-context';
import { HttpError } from '../../utils/http-error';
import { pedidoRepository } from '../pedidos/pedido.repository';
import { EstadoPedido } from '../pedidos/pedido.entity';
import { clienteRepository } from '../clientes/cliente.repository';
import { productoRepository } from '../productos/producto.repository';
import { usuarioRepository } from '../usuarios/usuario.repository';
import { esGravado, resolverTasaIgv } from '../empresa/igv.service';
import { obtenerConfiguracion } from '../configuracion/configuracion.service';
import {
  tipoComprobanteRepository,
  tipoOperacionRepository,
  medioPagoRepository,
  bancoRepository,
} from '../catalogos/catalogos.repository';
import { CODIGO_BOLETA, CODIGO_FACTURA } from '../catalogos/codigos-sunat';
import { consultarTipoCambio } from '../catalogos/tipo-cambio.service';
import { reservarNumero, resolverTalonarioParaVenta } from '../talonario/talonario.service';
import { guardarCuotas } from '../cobranzas/cobranza.service';
import { registrarConsumoVenta, anularSalidasVenta } from '../inventario/existencia.service';
import { comprobanteElectronicoRepository } from '../facturacion/facturacion.repository';
import { EstadoComprobante } from '../facturacion/comprobante-electronico.entity';
import {
  acreditarPuntosPorVenta,
  revertirPuntosPorVenta,
} from '../fidelizacion/fidelizacion.service';
import { ventaRepository, detalleVentaRepository } from './venta.repository';
import { EstadoVenta, FormaPago, Venta } from './venta.entity';
import { DetalleVenta } from './detalle-venta.entity';
import type { CrearVentaDto, LineaVentaDto } from './venta.dto';
import type { Cliente } from '../clientes/cliente.entity';
import type { Pedido } from '../pedidos/pedido.entity';
import type { Producto } from '../productos/producto.entity';
import type { TipoAfectacionIgv } from '../catalogos/tipo-afectacion-igv.entity';
import type { TipoComprobante } from '../catalogos/tipo-comprobante.entity';
import type { TipoOperacion } from '../catalogos/tipo-operacion.entity';
import type { MedioPago } from '../catalogos/medio-pago.entity';
import type { Banco } from '../catalogos/banco.entity';
import type { Talonario } from '../talonario/talonario.entity';

const RELACIONES = {
  empresa: true,
  pedido: { mesa: { salon: true } },
  talonario: true,
  cliente: { tipoDocumentoIdentidad: true },
  tipoComprobante: true,
  tipoOperacion: true,
  medioPago: true,
  banco: true,
  detalles: { producto: true, tipoAfectacionIgv: true },
} as const;

const CODIGO_RUC = '6';
const CODIGO_TIPO_OPERACION_DEFECTO = '0101';

/** Serie usada cuando el usuario no tiene ningún talonario asignado para ese comprobante:
 * es la numeración con la que funcionaba Ventas antes del módulo de Talonarios, y se
 * conserva para que una instalación sin talonarios configurados siga pudiendo facturar. */
const SERIE_POR_COMPROBANTE: Record<string, string> = {
  [CODIGO_BOLETA]: 'B001',
  [CODIGO_FACTURA]: 'F001',
};

function ordenarDetalles(venta: Venta): Venta {
  venta.detalles.sort((a, b) => a.creadoEn.getTime() - b.creadoEn.getTime());
  return venta;
}

export async function listarVentas(estado?: EstadoVenta): Promise<Venta[]> {
  const ventas = await ventaRepository.find({
    where: estado ? { estado } : {},
    relations: RELACIONES,
    order: { creadoEn: 'DESC' },
  });
  return ventas.map(ordenarDetalles);
}

export async function obtenerVenta(id: string): Promise<Venta> {
  const venta = await ventaRepository.findOne({ where: { id }, relations: RELACIONES });
  if (!venta) {
    throw new HttpError(404, 'Venta no encontrada');
  }
  return ordenarDetalles(venta);
}

async function resolverTipoComprobante(tipoComprobanteId: string): Promise<TipoComprobante> {
  const tipoComprobante = await tipoComprobanteRepository.findOneBy({ id: tipoComprobanteId });
  if (!tipoComprobante) {
    throw new HttpError(400, 'El tipo de comprobante indicado no existe', [
      'tipoComprobanteId inválido',
    ]);
  }
  if (tipoComprobante.codigo !== CODIGO_BOLETA && tipoComprobante.codigo !== CODIGO_FACTURA) {
    throw new HttpError(400, 'Solo se pueden emitir boletas o facturas desde Ventas');
  }
  return tipoComprobante;
}

async function resolverCliente(
  clienteId: string | undefined,
  tipoComprobante: TipoComprobante,
): Promise<Cliente | null> {
  if (tipoComprobante.codigo === CODIGO_FACTURA) {
    if (!clienteId) {
      throw new HttpError(400, 'Una factura requiere indicar el cliente (con RUC)');
    }
    const cliente = await clienteRepository.findOne({
      where: { id: clienteId },
      relations: { tipoDocumentoIdentidad: true },
    });
    if (!cliente) {
      throw new HttpError(400, 'El cliente indicado no existe', ['clienteId inválido']);
    }
    if (cliente.tipoDocumentoIdentidad?.codigo !== CODIGO_RUC) {
      throw new HttpError(400, 'Una factura requiere que el cliente tenga RUC registrado');
    }
    return cliente;
  }

  if (!clienteId) return null;
  const cliente = await clienteRepository.findOneBy({ id: clienteId });
  if (!cliente) {
    throw new HttpError(400, 'El cliente indicado no existe', ['clienteId inválido']);
  }
  return cliente;
}

async function resolverTipoOperacion(tipoOperacionId: string | undefined): Promise<TipoOperacion> {
  if (!tipoOperacionId) {
    const porDefecto = await tipoOperacionRepository.findOneBy({
      codigo: CODIGO_TIPO_OPERACION_DEFECTO,
    });
    if (!porDefecto) {
      throw new HttpError(500, 'No se encontró el tipo de operación por defecto');
    }
    return porDefecto;
  }
  const tipoOperacion = await tipoOperacionRepository.findOneBy({ id: tipoOperacionId });
  if (!tipoOperacion) {
    throw new HttpError(400, 'El tipo de operación indicado no existe', [
      'tipoOperacionId inválido',
    ]);
  }
  return tipoOperacion;
}

async function resolverMedioPago(
  medioPagoId: string | undefined,
  formaPago: FormaPago,
): Promise<MedioPago | null> {
  if (!medioPagoId) {
    if (formaPago === FormaPago.CONTADO) {
      throw new HttpError(400, 'Una venta al contado requiere indicar el medio de pago');
    }
    return null;
  }
  const medioPago = await medioPagoRepository.findOneBy({ id: medioPagoId });
  if (!medioPago) {
    throw new HttpError(400, 'El medio de pago indicado no existe', ['medioPagoId inválido']);
  }
  return medioPago;
}

/** Correlativo de la serie fija, sin talonario de por medio: el siguiente al mayor emitido.
 * Se ejecuta dentro de la transacción de la venta, igual que `reservarNumero`. */
/**
 * Sustento bancario del cobro al contado. La Ley 28194 (bancarización) obliga a canalizar por
 * el sistema financiero desde S/ 2,000 o US$ 500, y en ese caso el comprobante tiene que poder
 * mostrar por qué entidad entró el dinero y con qué número de operación. Qué medios lo exigen
 * es un dato del catálogo (`MedioPago.requiereBanco`), no una lista de códigos aquí.
 */
async function resolverBanco(
  medioPago: MedioPago | null,
  bancoId: string | undefined,
  numeroOperacion: string | undefined,
): Promise<Banco | null> {
  if (!medioPago?.requiereBanco) return null;

  if (!bancoId) {
    throw new HttpError(400, `Un pago por ${medioPago.nombre.toLowerCase()} requiere el banco`, [
      'bancoId requerido',
    ]);
  }
  if (!numeroOperacion) {
    throw new HttpError(
      400,
      `Un pago por ${medioPago.nombre.toLowerCase()} requiere el número de operación`,
      ['numeroOperacion requerido'],
    );
  }
  const banco = await bancoRepository.findOneBy({ id: bancoId });
  if (!banco) {
    throw new HttpError(400, 'El banco indicado no existe', ['bancoId inválido']);
  }
  return banco;
}

// El plazo por defecto de una venta al crédito lo define cada restaurante en su
// configuración (FASE 21); antes era una constante fija de 30 días.

function fechaEnDias(dias: number): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
}

async function generarNumeroCorrelativo(
  manager: EntityManager,
  tipoComprobanteId: string,
  serie: string,
): Promise<number> {
  const ultima = await manager.findOne(Venta, {
    where: { tipoComprobante: { id: tipoComprobanteId }, serie },
    order: { numero: 'DESC' },
  });
  return (ultima?.numero ?? 0) + 1;
}

/** Serie y número de una venta emitida sin talonario asignado. */
async function numerarSinTalonario(
  manager: EntityManager,
  tipoComprobante: TipoComprobante,
): Promise<{ serie: string; numero: number }> {
  const serie = SERIE_POR_COMPROBANTE[tipoComprobante.codigo] as string;
  return { serie, numero: await generarNumeroCorrelativo(manager, tipoComprobante.id, serie) };
}

interface LineasResueltas {
  detalles: DetalleVenta[];
  subtotal: number;
  igv: number;
  total: number;
}

/**
 * Desglose de IGV de una línea a partir de su subtotal (que ya lo incluye si el producto es
 * gravado) — mismo cálculo tanto si la línea viene copiada de un Pedido como si se agregó
 * directamente en una venta manual, para no bifurcar la regla fiscal según el origen.
 */
function calcularLinea(
  producto: Producto,
  subtotalLinea: number,
  tasaIgv: number,
): { tipoAfectacionIgv: TipoAfectacionIgv; valorVenta: number; igv: number } {
  const tipoAfectacionIgv = producto.tipoAfectacionIgv;
  const gravado = esGravado(tipoAfectacionIgv);
  const valorVenta = gravado
    ? Math.round((subtotalLinea / (1 + tasaIgv)) * 100) / 100
    : subtotalLinea;
  const igv = gravado ? Math.round((subtotalLinea - valorVenta) * 100) / 100 : 0;
  return { tipoAfectacionIgv, valorVenta, igv };
}

/** Venta a partir de un pedido cerrado: copia (snapshot) cada línea del pedido tal cual. */
function construirDesdePedido(pedido: Pedido, tasaIgv: number): LineasResueltas {
  let subtotal = 0;
  let igv = 0;
  const detalles = pedido.detalles.map((detallePedido) => {
    const {
      tipoAfectacionIgv,
      valorVenta,
      igv: igvLinea,
    } = calcularLinea(detallePedido.producto, detallePedido.subtotal, tasaIgv);
    subtotal += valorVenta;
    igv += igvLinea;
    return detalleVentaRepository.create({
      producto: detallePedido.producto,
      descripcionProducto: detallePedido.producto.nombre,
      cantidad: detallePedido.cantidad,
      precioUnitario: detallePedido.precioUnitario,
      tipoAfectacionIgv,
      valorVenta,
      igv: igvLinea,
      subtotal: detallePedido.subtotal,
    });
  });
  return {
    detalles,
    subtotal: Math.round(subtotal * 100) / 100,
    igv: Math.round(igv * 100) / 100,
    total: pedido.total,
  };
}

/**
 * Venta directa (sin pedido de origen): resuelve cada línea contra el catálogo de productos
 * vigente, igual que `agregarDetalle` de Pedidos — es la misma idea (producto + cantidad →
 * snapshot de precio), solo que aquí el snapshot queda directamente en `detalle_ventas`
 * porque nunca existió un `DetallePedido` intermedio.
 */
async function construirDirectas(
  lineas: LineaVentaDto[],
  tasaIgv: number,
): Promise<LineasResueltas> {
  let subtotal = 0;
  let igv = 0;
  let total = 0;
  const detalles: DetalleVenta[] = [];

  for (const linea of lineas) {
    const producto = await productoRepository.findOne({
      where: { id: linea.productoId },
      relations: { tipoAfectacionIgv: true },
    });
    if (!producto) {
      throw new HttpError(400, 'Uno de los productos indicados no existe', [
        'detalles[].productoId inválido',
      ]);
    }
    if (!producto.activo) {
      throw new HttpError(400, `El producto "${producto.nombre}" está inactivo`);
    }

    const subtotalLinea = Math.round(producto.precio * linea.cantidad * 100) / 100;
    const {
      tipoAfectacionIgv,
      valorVenta,
      igv: igvLinea,
    } = calcularLinea(producto, subtotalLinea, tasaIgv);

    subtotal += valorVenta;
    igv += igvLinea;
    total += subtotalLinea;
    detalles.push(
      detalleVentaRepository.create({
        producto,
        descripcionProducto: producto.nombre,
        cantidad: linea.cantidad,
        precioUnitario: producto.precio,
        tipoAfectacionIgv,
        valorVenta,
        igv: igvLinea,
        subtotal: subtotalLinea,
      }),
    );
  }

  return {
    detalles,
    subtotal: Math.round(subtotal * 100) / 100,
    igv: Math.round(igv * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

/** Código de Postgres para "violación de restricción única". */
const UNIQUE_VIOLATION = '23505';

/** Índice único de `ventas (tipo_comprobante_id, serie, numero)` — ver `venta.entity.ts`. */
const INDICE_CORRELATIVO = 'IDX_un_correlativo_por_serie';

/**
 * Cuántas veces se vuelve a intentar la venta cuando su correlativo resultó estar ocupado.
 * Con 3 alcanza de sobra: cada reintento salta al siguiente número libre, así que solo haría
 * falta más si hubiera tantos cajeros emitiendo a la vez sobre la misma serie que se pisaran
 * tres veces seguidas — y ese caso ya lo previene el `FOR UPDATE` de `reservarNumero`.
 */
const MAXIMO_REINTENTOS_CORRELATIVO = 3;

function esColisionDeCorrelativo(error: unknown): boolean {
  const driverError = (error as { driverError?: { code?: string; constraint?: string } })
    ?.driverError;
  return driverError?.code === UNIQUE_VIOLATION && driverError?.constraint === INDICE_CORRELATIVO;
}

/**
 * Guarda la venta reintentando si su número ya estaba tomado.
 *
 * El caso: dos cajeros con la MISMA serie abierta a la vez. El `FOR UPDATE` de
 * `reservarNumero` ya serializa a los que comparten talonario, pero el número puede estar
 * ocupado igual si la serie se emite desde dos talonarios distintos, o si alguien insertó un
 * comprobante por fuera del sistema. En todos esos casos la regla es la misma y es la que
 * pidió el usuario: **la venta que llegó primero se queda con el número**, y la segunda no se
 * pierde — se vuelve a numerar con el siguiente libre.
 *
 * No hace falta resincronizar el talonario a mano: `reservarNumero` calcula el siguiente
 * número contra el máximo realmente emitido en `ventas` (no solo contra `numero_actual`), así
 * que el reintento ya salta el hueco y deja `numero_actual` al día. La venta devuelta trae el
 * número definitivo, y el frontend avisa si no es el que mostraba.
 */
async function guardarReintentandoColision(
  intentar: () => Promise<Venta>,
  talonario: Talonario | null,
): Promise<Venta> {
  for (let intento = 1; ; intento += 1) {
    try {
      return await intentar();
    } catch (error) {
      if (!esColisionDeCorrelativo(error) || intento >= MAXIMO_REINTENTOS_CORRELATIVO) {
        if (esColisionDeCorrelativo(error)) {
          const serie = talonario ? ` ${talonario.serie}` : '';
          throw new HttpError(
            409,
            `El correlativo de la serie${serie} está siendo usado por otra venta en este momento. Vuelve a intentarlo.`,
          );
        }
        throw error;
      }
    }
  }
}

export async function crearVenta(usuarioId: string, dto: CrearVentaDto): Promise<Venta> {
  let pedido: Pedido | null = null;
  let lineas: LineasResueltas;
  const tasaIgv = await resolverTasaIgv();

  if (dto.pedidoId) {
    pedido = await pedidoRepository.findOne({
      where: { id: dto.pedidoId },
      relations: { detalles: { producto: { tipoAfectacionIgv: true }, comanda: true } },
    });
    if (!pedido) {
      throw new HttpError(400, 'El pedido indicado no existe', ['pedidoId inválido']);
    }
    if (pedido.estado !== EstadoPedido.CERRADO) {
      throw new HttpError(400, 'Solo se puede facturar un pedido cerrado');
    }
    const ventaExistente = await ventaRepository.findOneBy({ pedido: { id: pedido.id } });
    if (ventaExistente) {
      throw new HttpError(409, 'Este pedido ya tiene una venta registrada');
    }
    if (pedido.detalles.length === 0) {
      throw new HttpError(400, 'El pedido no tiene productos');
    }
    lineas = construirDesdePedido(pedido, tasaIgv);
  } else {
    // El schema exige `detalles` cuando no hay pedidoId (ver crearVentaSchema.refine).
    lineas = await construirDirectas(dto.detalles!, tasaIgv);
  }

  const tipoComprobante = await resolverTipoComprobante(dto.tipoComprobanteId);
  const cliente = await resolverCliente(dto.clienteId, tipoComprobante);
  const tipoOperacion = await resolverTipoOperacion(dto.tipoOperacionId);
  const formaPago = dto.formaPago ?? FormaPago.CONTADO;
  const medioPago = await resolverMedioPago(dto.medioPagoId, formaPago);
  // En una venta al crédito el dinero no entró todavía: el banco se registra en cada cobro
  // (`PagoVenta`), no en la venta.
  const banco =
    formaPago === FormaPago.CONTADO
      ? await resolverBanco(medioPago, dto.bancoId, dto.numeroOperacion)
      : null;

  // Serie y correlativo salen del talonario asignado al usuario; sin talonarios configurados
  // se usa la serie fija de siempre (ver SERIE_POR_COMPROBANTE).
  const talonario = await resolverTalonarioParaVenta(usuarioId, tipoComprobante, dto.talonarioId);

  const fechaEmision = new Date();
  const tipoCambio = await consultarTipoCambio(fechaEmision);

  // Reservar el correlativo, guardar la venta y consumir el talonario tienen que ser
  // atómicos: si la venta fallara después de avanzar el número, ese número quedaría quemado
  // sin comprobante detrás (y al revés, dos cajeros simultáneos repetirían el mismo número).
  const intentarGuardar = () =>
    enTransaccion(async (manager) => {
      const { serie, numero } = talonario
        ? await reservarNumero(manager, talonario.id)
        : await numerarSinTalonario(manager, tipoComprobante);

      const venta = manager.create(Venta, {
        pedido,
        cliente,
        tipoComprobante,
        talonario,
        serie,
        numero,
        tipoOperacion,
        formaPago,
        medioPago,
        banco,
        numeroOperacion: banco ? (dto.numeroOperacion ?? null) : null,
        subtotal: lineas.subtotal,
        igv: lineas.igv,
        total: lineas.total,
        propina: dto.propina ?? 0,
        tipoCambio: tipoCambio?.venta ?? null,
      });
      const ventaGuardada = await manager.save(Venta, venta);

      lineas.detalles.forEach((detalle) => {
        detalle.venta = ventaGuardada;
      });
      await manager.save(DetalleVenta, lineas.detalles);

      // Un comprobante al crédito debe llevar su cronograma de cuotas (RS 193-2020/SUNAT).
      // Se guarda en la misma transacción: una venta al crédito sin cuotas no es válida.
      if (formaPago === FormaPago.CREDITO) {
        await guardarCuotas(
          manager,
          ventaGuardada,
          dto.fechaPrimerVencimiento ??
            fechaEnDias((await obtenerConfiguracion()).diasCreditoPorDefecto),
          dto.numeroCuotas ?? 1,
        );
      }

      return ventaGuardada;
    });

  const guardada = await guardarReintentandoColision(intentarGuardar, talonario);

  // Descuenta insumos/mercadería que no se hayan consumido ya al entregar la comanda (venta
  // directa, o líneas de un pedido que nunca pasaron por cocina) — ver existencia.service.ts.
  await registrarConsumoVenta(guardada, pedido, dto.pedidoId ? null : (dto.detalles ?? null));

  // Acumula puntos de fidelización si el programa está activo y la venta tiene cliente
  // identificado — ver fidelizacion.service.ts.
  await acreditarPuntosPorVenta(guardada);

  return obtenerVenta(guardada.id);
}

export async function anularVenta(usuarioId: string, id: string): Promise<void> {
  const venta = await obtenerVenta(id);
  if (venta.estado === EstadoVenta.ANULADA) {
    throw new HttpError(400, 'La venta ya está anulada');
  }

  // Una vez que SUNAT aceptó (u observó) el comprobante, ya no se puede "borrar" el hecho de
  // haberlo emitido: la única forma legal de corregirlo es una Nota de Crédito que lo
  // referencie (ver `modules/notas-venta/nota-venta.service.ts: crearNotaCredito`), que además
  // dejará la venta en `anulada` como parte del mismo paso.
  const comprobante = await comprobanteElectronicoRepository.findOneBy({ venta: { id } });
  if (
    comprobante &&
    (comprobante.estado === EstadoComprobante.ACEPTADO ||
      comprobante.estado === EstadoComprobante.OBSERVADO)
  ) {
    throw new HttpError(
      409,
      'Esta venta ya tiene un comprobante electrónico aceptado por SUNAT: no puede anularse directamente. Registra una Nota de Crédito en su lugar.',
    );
  }

  venta.estado = EstadoVenta.ANULADA;
  await ventaRepository.save(venta);

  // Devuelve el stock y los puntos que esta venta había generado. No corre dentro de un
  // `enTransaccion` explícito porque no hace falta: toda la petición HTTP ya corre en una
  // única transacción de Postgres (ver `middlewares/tenant.middleware.ts`), así que si
  // cualquiera de los dos pasos de abajo falla, el cambio de estado de arriba también se
  // revierte — la venta nunca queda "anulada" a medias.
  const usuario = await usuarioRepository.findOneBy({ id: usuarioId });
  if (!usuario) {
    throw new HttpError(401, 'Usuario no encontrado');
  }
  await anularSalidasVenta(venta, usuario);
  await revertirPuntosPorVenta(venta);
}
