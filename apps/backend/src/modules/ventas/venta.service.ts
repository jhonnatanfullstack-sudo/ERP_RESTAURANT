import { HttpError } from '../../utils/http-error';
import { pedidoRepository } from '../pedidos/pedido.repository';
import { EstadoPedido } from '../pedidos/pedido.entity';
import { clienteRepository } from '../clientes/cliente.repository';
import {
  tipoComprobanteRepository,
  tipoOperacionRepository,
  medioPagoRepository,
} from '../catalogos/catalogos.repository';
import { ventaRepository, detalleVentaRepository } from './venta.repository';
import { EstadoVenta, FormaPago, Venta } from './venta.entity';
import { DetalleVenta } from './detalle-venta.entity';
import type { CrearVentaDto } from './venta.dto';
import type { Cliente } from '../clientes/cliente.entity';
import type { TipoComprobante } from '../catalogos/tipo-comprobante.entity';
import type { TipoOperacion } from '../catalogos/tipo-operacion.entity';
import type { MedioPago } from '../catalogos/medio-pago.entity';

const RELACIONES = {
  pedido: { mesa: { salon: true } },
  cliente: true,
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

export async function crearVenta(dto: CrearVentaDto): Promise<Venta> {
  const pedido = await pedidoRepository.findOne({
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

  const tipoComprobante = await resolverTipoComprobante(dto.tipoComprobanteId);
  const cliente = await resolverCliente(dto.clienteId, tipoComprobante);
  const tipoOperacion = await resolverTipoOperacion(dto.tipoOperacionId);
  const formaPago = dto.formaPago ?? FormaPago.CONTADO;
  const medioPago = await resolverMedioPago(dto.medioPagoId, formaPago);

  const serie = SERIE_POR_COMPROBANTE[tipoComprobante.codigo];
  const numero = await generarNumeroCorrelativo(tipoComprobante.id, serie);

  let subtotal = 0;
  let igv = 0;
  const detalles: DetalleVenta[] = pedido.detalles.map((detallePedido) => {
    const tipoAfectacionIgv = detallePedido.producto.tipoAfectacionIgv;
    const esGravado = tipoAfectacionIgv.codigo === '10';
    const subtotalLinea = detallePedido.subtotal;
    const valorVentaLinea = esGravado
      ? Math.round((subtotalLinea / (1 + TASA_IGV)) * 100) / 100
      : subtotalLinea;
    const igvLinea = esGravado ? Math.round((subtotalLinea - valorVentaLinea) * 100) / 100 : 0;

    subtotal += valorVentaLinea;
    igv += igvLinea;

    return detalleVentaRepository.create({
      producto: detallePedido.producto,
      descripcionProducto: detallePedido.producto.nombre,
      cantidad: detallePedido.cantidad,
      precioUnitario: detallePedido.precioUnitario,
      tipoAfectacionIgv,
      valorVenta: valorVentaLinea,
      igv: igvLinea,
      subtotal: subtotalLinea,
    });
  });

  const venta = ventaRepository.create({
    pedido,
    cliente,
    tipoComprobante,
    serie,
    numero,
    tipoOperacion,
    formaPago,
    medioPago,
    subtotal: Math.round(subtotal * 100) / 100,
    igv: Math.round(igv * 100) / 100,
    total: pedido.total,
  });
  const guardada = await ventaRepository.save(venta);

  detalles.forEach((detalle) => {
    detalle.venta = guardada;
  });
  await detalleVentaRepository.save(detalles);

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
