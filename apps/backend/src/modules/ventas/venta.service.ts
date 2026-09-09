import { HttpError } from '../../utils/http-error';
import { pedidoRepository } from '../pedidos/pedido.repository';
import { EstadoPedido } from '../pedidos/pedido.entity';
import { clienteRepository } from '../clientes/cliente.repository';
import { productoRepository } from '../productos/producto.repository';
import {
  tipoComprobanteRepository,
  tipoOperacionRepository,
  medioPagoRepository,
} from '../catalogos/catalogos.repository';
import { consultarTipoCambio } from '../catalogos/tipo-cambio.service';
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

const RELACIONES = {
  pedido: { mesa: { salon: true } },
  cliente: { tipoDocumentoIdentidad: true },
  tipoComprobante: true,
  tipoOperacion: true,
  medioPago: true,
  detalles: { producto: true, tipoAfectacionIgv: true },
} as const;

/** Tasa de IGV vigente en Perú (16% IGV + 2% IPM). Cambiar aquí si SUNAT modifica la tasa. */
const TASA_IGV = 0.18;

const CODIGO_BOLETA = '03';
const CODIGO_FACTURA = '01';
const CODIGO_RUC = '6';
const CODIGO_AFECTACION_GRAVADO = '10';
const CODIGO_TIPO_OPERACION_DEFECTO = '0101';

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

async function generarNumeroCorrelativo(tipoComprobanteId: string, serie: string): Promise<number> {
  const ultima = await ventaRepository.findOne({
    where: { tipoComprobante: { id: tipoComprobanteId }, serie },
    order: { numero: 'DESC' },
  });
  return (ultima?.numero ?? 0) + 1;
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
): { tipoAfectacionIgv: TipoAfectacionIgv; valorVenta: number; igv: number } {
  const tipoAfectacionIgv = producto.tipoAfectacionIgv;
  const esGravado = tipoAfectacionIgv.codigo === CODIGO_AFECTACION_GRAVADO;
  const valorVenta = esGravado
    ? Math.round((subtotalLinea / (1 + TASA_IGV)) * 100) / 100
    : subtotalLinea;
  const igv = esGravado ? Math.round((subtotalLinea - valorVenta) * 100) / 100 : 0;
  return { tipoAfectacionIgv, valorVenta, igv };
}

/** Venta a partir de un pedido cerrado: copia (snapshot) cada línea del pedido tal cual. */
function construirDesdePedido(pedido: Pedido): LineasResueltas {
  let subtotal = 0;
  let igv = 0;
  const detalles = pedido.detalles.map((detallePedido) => {
    const {
      tipoAfectacionIgv,
      valorVenta,
      igv: igvLinea,
    } = calcularLinea(detallePedido.producto, detallePedido.subtotal);
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
async function construirDirectas(lineas: LineaVentaDto[]): Promise<LineasResueltas> {
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
    const { tipoAfectacionIgv, valorVenta, igv: igvLinea } = calcularLinea(producto, subtotalLinea);

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

export async function crearVenta(dto: CrearVentaDto): Promise<Venta> {
  let pedido: Pedido | null = null;
  let lineas: LineasResueltas;

  if (dto.pedidoId) {
    pedido = await pedidoRepository.findOne({
      where: { id: dto.pedidoId },
      relations: { detalles: { producto: { tipoAfectacionIgv: true } } },
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
    lineas = construirDesdePedido(pedido);
  } else {
    // El schema exige `detalles` cuando no hay pedidoId (ver crearVentaSchema.refine).
    lineas = await construirDirectas(dto.detalles!);
  }

  const tipoComprobante = await resolverTipoComprobante(dto.tipoComprobanteId);
  const cliente = await resolverCliente(dto.clienteId, tipoComprobante);
  const tipoOperacion = await resolverTipoOperacion(dto.tipoOperacionId);
  const formaPago = dto.formaPago ?? FormaPago.CONTADO;
  const medioPago = await resolverMedioPago(dto.medioPagoId, formaPago);

  const serie = SERIE_POR_COMPROBANTE[tipoComprobante.codigo];
  const numero = await generarNumeroCorrelativo(tipoComprobante.id, serie);
  const fechaEmision = new Date();
  const tipoCambio = await consultarTipoCambio(fechaEmision);

  const venta = ventaRepository.create({
    pedido,
    cliente,
    tipoComprobante,
    serie,
    numero,
    tipoOperacion,
    formaPago,
    medioPago,
    subtotal: lineas.subtotal,
    igv: lineas.igv,
    total: lineas.total,
    tipoCambio: tipoCambio?.venta ?? null,
  });
  const guardada = await ventaRepository.save(venta);

  lineas.detalles.forEach((detalle) => {
    detalle.venta = guardada;
  });
  await detalleVentaRepository.save(lineas.detalles);

  return obtenerVenta(guardada.id);
}

export async function anularVenta(id: string): Promise<void> {
  const venta = await obtenerVenta(id);
  if (venta.estado === EstadoVenta.ANULADA) {
    throw new HttpError(400, 'La venta ya está anulada');
  }
  venta.estado = EstadoVenta.ANULADA;
  await ventaRepository.save(venta);
}
