import { HttpError } from '../../utils/http-error';
import { AppDataSource } from '../../database/data-source';
import { proveedorRepository } from '../proveedores/proveedor.repository';
import { almacenRepository } from '../almacenes/almacen.repository';
import { tipoComprobanteRepository } from '../catalogos/catalogos.repository';
import { insumoRepository } from '../insumos/insumo.repository';
import { productoRepository } from '../productos/producto.repository';
import { TipoProducto } from '../productos/producto.entity';
import { usuarioRepository } from '../usuarios/usuario.repository';
import { registrarEntradasCompra, anularEntradasCompra } from '../inventario/existencia.service';
import { compraRepository, detalleCompraRepository } from './compra.repository';
import { Compra, EstadoCompra } from './compra.entity';
import { DetalleCompra } from './detalle-compra.entity';
import type { CrearCompraDto, LineaCompraDto } from './compra.dto';
import type { Insumo } from '../insumos/insumo.entity';
import type { Producto } from '../productos/producto.entity';
import type { TipoAfectacionIgv } from '../catalogos/tipo-afectacion-igv.entity';
import type { TipoComprobante } from '../catalogos/tipo-comprobante.entity';
import type { Almacen } from '../almacenes/almacen.entity';
import type { Proveedor } from '../proveedores/proveedor.entity';
import type { Usuario } from '../usuarios/usuario.entity';

const RELACIONES = {
  proveedor: { tipoDocumentoIdentidad: true },
  almacen: true,
  tipoComprobante: true,
  usuario: { personal: true },
  detalles: { insumo: { unidadMedida: true }, producto: true, tipoAfectacionIgv: true },
} as const;

/** Tasa de IGV que le cobra un proveedor — siempre la general (18%): la tasa reducida MYPE
 * de restaurantes (10.5%, ver `venta.service.ts`) es sobre lo que el restaurante le vende a
 * *sus* clientes, no sobre lo que a él le cobra un proveedor externo. */
const TASA_IGV_COMPRAS = 0.18;
const CODIGO_AFECTACION_GRAVADO = '10';

function ordenarDetalles(compra: Compra): Compra {
  compra.detalles.sort((a, b) => a.creadoEn.getTime() - b.creadoEn.getTime());
  return compra;
}

export async function listarCompras(): Promise<Compra[]> {
  const compras = await compraRepository.find({
    relations: RELACIONES,
    order: { creadoEn: 'DESC' },
  });
  return compras.map(ordenarDetalles);
}

export async function obtenerCompra(id: string): Promise<Compra> {
  const compra = await compraRepository.findOne({ where: { id }, relations: RELACIONES });
  if (!compra) {
    throw new HttpError(404, 'Compra no encontrada');
  }
  return ordenarDetalles(compra);
}

async function resolverProveedor(proveedorId: string) {
  const proveedor = await proveedorRepository.findOneBy({ id: proveedorId });
  if (!proveedor) {
    throw new HttpError(400, 'El proveedor indicado no existe', ['proveedorId inválido']);
  }
  return proveedor;
}

async function resolverAlmacen(almacenId: string): Promise<Almacen> {
  const almacen = await almacenRepository.findOneBy({ id: almacenId });
  if (!almacen) {
    throw new HttpError(400, 'El almacén indicado no existe', ['almacenId inválido']);
  }
  return almacen;
}

/** Desglose de IGV de una línea a partir de su `costoUnitario × cantidad`, siempre con la tasa
 * general (ver nota de `TASA_IGV_COMPRAS`). El proveedor puede facturar de dos formas — se
 * distingue con `incluyeIgv` (a nivel de compra, ver `Compra.incluyeIgv`):
 * - Incluido (lo usual, misma convención que `Producto.precio` y `venta.service.ts:
 *   calcularLinea`): el monto ya trae el IGV, se desglosa hacia atrás.
 * - No incluido: el monto ES el valor de compra, el IGV se agrega hacia adelante. */
function calcularLineaCompra(
  tipoAfectacionIgv: TipoAfectacionIgv,
  montoLinea: number,
  incluyeIgv: boolean,
): { valorCompra: number; igv: number; subtotal: number } {
  const esGravado = tipoAfectacionIgv.codigo === CODIGO_AFECTACION_GRAVADO;
  if (!esGravado) {
    return { valorCompra: montoLinea, igv: 0, subtotal: montoLinea };
  }
  if (incluyeIgv) {
    const valorCompra = Math.round((montoLinea / (1 + TASA_IGV_COMPRAS)) * 100) / 100;
    const igv = Math.round((montoLinea - valorCompra) * 100) / 100;
    return { valorCompra, igv, subtotal: montoLinea };
  }
  const igv = Math.round(montoLinea * TASA_IGV_COMPRAS * 100) / 100;
  return { valorCompra: montoLinea, igv, subtotal: Math.round((montoLinea + igv) * 100) / 100 };
}

interface LineaResuelta {
  detalle: DetalleCompra;
  insumo: Insumo | null;
  producto: Producto | null;
}

async function resolverLinea(linea: LineaCompraDto, incluyeIgv: boolean): Promise<LineaResuelta> {
  let insumo: Insumo | null = null;
  let producto: Producto | null = null;
  let tipoAfectacionIgv: TipoAfectacionIgv;
  let descripcionItem: string;

  if (linea.insumoId) {
    insumo = await insumoRepository.findOne({
      where: { id: linea.insumoId },
      relations: { tipoAfectacionIgv: true },
    });
    if (!insumo) {
      throw new HttpError(400, 'Uno de los insumos indicados no existe', [
        'lineas[].insumoId inválido',
      ]);
    }
    tipoAfectacionIgv = insumo.tipoAfectacionIgv;
    descripcionItem = insumo.nombre;
  } else {
    producto = await productoRepository.findOne({
      where: { id: linea.productoId! },
      relations: { tipoAfectacionIgv: true },
    });
    if (!producto) {
      throw new HttpError(400, 'Uno de los productos indicados no existe', [
        'lineas[].productoId inválido',
      ]);
    }
    if (producto.tipo !== TipoProducto.MERCADERIA) {
      throw new HttpError(400, `"${producto.nombre}" no es tipo mercadería: no se puede comprar`);
    }
    tipoAfectacionIgv = producto.tipoAfectacionIgv;
    descripcionItem = producto.nombre;
  }

  const montoLinea = Math.round(linea.costoUnitario * linea.cantidad * 100) / 100;
  const { valorCompra, igv, subtotal } = calcularLineaCompra(
    tipoAfectacionIgv,
    montoLinea,
    incluyeIgv,
  );

  const detalle = detalleCompraRepository.create({
    insumo,
    producto,
    descripcionItem,
    cantidad: linea.cantidad,
    costoUnitario: linea.costoUnitario,
    tipoAfectacionIgv,
    valorCompra,
    igv,
    subtotal,
  });

  return { detalle, insumo, producto };
}

interface CabeceraResuelta {
  proveedor: Proveedor;
  almacen: Almacen;
  tipoComprobante: TipoComprobante | null;
  usuario: Usuario;
  lineasResueltas: LineaResuelta[];
  subtotal: number;
  igv: number;
  total: number;
}

/** Resuelve y valida todo lo común entre registrar y editar una compra: proveedor, almacén,
 * comprobante, usuario y líneas (con sus totales). Evita repetir esta secuencia dos veces. */
async function resolverCabeceraYLineas(
  usuarioId: string,
  dto: CrearCompraDto,
): Promise<CabeceraResuelta> {
  const proveedor = await resolverProveedor(dto.proveedorId);
  const almacen = await resolverAlmacen(dto.almacenId);
  const tipoComprobante = dto.tipoComprobanteId
    ? await tipoComprobanteRepository.findOneBy({ id: dto.tipoComprobanteId })
    : null;
  if (dto.tipoComprobanteId && !tipoComprobante) {
    throw new HttpError(400, 'El tipo de comprobante indicado no existe', [
      'tipoComprobanteId inválido',
    ]);
  }
  const usuario = await usuarioRepository.findOneBy({ id: usuarioId });
  if (!usuario) {
    throw new HttpError(401, 'Usuario no encontrado');
  }

  const lineasResueltas = await Promise.all(
    dto.lineas.map((linea) => resolverLinea(linea, dto.incluyeIgv)),
  );

  let subtotal = 0;
  let igv = 0;
  let total = 0;
  for (const { detalle } of lineasResueltas) {
    subtotal += detalle.valorCompra;
    igv += detalle.igv;
    total += detalle.subtotal;
  }

  return {
    proveedor,
    almacen,
    tipoComprobante,
    usuario,
    lineasResueltas,
    subtotal: Math.round(subtotal * 100) / 100,
    igv: Math.round(igv * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

export async function crearCompra(usuarioId: string, dto: CrearCompraDto): Promise<Compra> {
  const { proveedor, almacen, tipoComprobante, usuario, lineasResueltas, subtotal, igv, total } =
    await resolverCabeceraYLineas(usuarioId, dto);

  const compra = compraRepository.create({
    proveedor,
    almacen,
    tipoComprobante,
    serie: dto.serie ?? null,
    numero: dto.numero ?? null,
    fechaEmision: dto.fechaEmision ?? new Date().toISOString().slice(0, 10),
    incluyeIgv: dto.incluyeIgv,
    subtotal,
    igv,
    total,
    observacion: dto.observacion ?? null,
    usuario,
  });
  const guardada = await compraRepository.save(compra);

  const detalles = lineasResueltas.map((l) => l.detalle);
  detalles.forEach((detalle) => {
    detalle.compra = guardada;
  });
  await detalleCompraRepository.save(detalles);

  await registrarEntradasCompra(guardada, detalles, almacen, usuario);

  return obtenerCompra(guardada.id);
}

/**
 * Reemplaza por completo una compra registrada (cabecera + ítems). A diferencia de Ventas, acá
 * sí se permite editar porque el kardex es un libro de movimientos append-only: en vez de tocar
 * los movimientos `compra` ya guardados, los reversa con `anularEntradasCompra` (la misma
 * función que usa una anulación) y da de alta las líneas nuevas con `registrarEntradasCompra` —
 * todo dentro de una transacción, para que el stock nunca quede a medio actualizar si algo
 * falla a mitad de camino. Los `detalle_compra` anteriores sí se reemplazan en la fila (no son
 * un libro de movimientos, solo el detalle "actual" de la compra — mismo criterio que
 * `reemplazarReceta`). No se permite editar una compra ya anulada.
 */
export async function actualizarCompra(
  id: string,
  usuarioId: string,
  dto: CrearCompraDto,
): Promise<Compra> {
  const compra = await obtenerCompra(id);
  if (compra.estado === EstadoCompra.ANULADA) {
    throw new HttpError(400, 'No se puede modificar una compra anulada');
  }

  const { proveedor, almacen, tipoComprobante, usuario, lineasResueltas, subtotal, igv, total } =
    await resolverCabeceraYLineas(usuarioId, dto);

  await AppDataSource.transaction(async (manager) => {
    await anularEntradasCompra(compra, usuario, manager, 'Reversa por edición de compra');

    await manager.delete(DetalleCompra, { compra: { id: compra.id } });

    const detalles = lineasResueltas.map((l) => l.detalle);
    detalles.forEach((detalle) => {
      detalle.compra = compra;
    });
    await manager.save(DetalleCompra, detalles);

    compra.proveedor = proveedor;
    compra.almacen = almacen;
    compra.tipoComprobante = tipoComprobante;
    compra.serie = dto.serie ?? null;
    compra.numero = dto.numero ?? null;
    compra.fechaEmision = dto.fechaEmision ?? compra.fechaEmision;
    compra.incluyeIgv = dto.incluyeIgv;
    compra.subtotal = subtotal;
    compra.igv = igv;
    compra.total = total;
    compra.observacion = dto.observacion ?? null;
    await manager.save(Compra, compra);

    await registrarEntradasCompra(compra, detalles, almacen, usuario, manager);
  });

  return obtenerCompra(id);
}

export async function anularCompra(id: string, usuarioId: string): Promise<Compra> {
  const compra = await obtenerCompra(id);
  if (compra.estado === EstadoCompra.ANULADA) {
    throw new HttpError(400, 'La compra ya está anulada');
  }
  const usuario = await usuarioRepository.findOneBy({ id: usuarioId });
  if (!usuario) {
    throw new HttpError(401, 'Usuario no encontrado');
  }

  await anularEntradasCompra(compra, usuario);

  compra.estado = EstadoCompra.ANULADA;
  await compraRepository.save(compra);
  return obtenerCompra(id);
}
