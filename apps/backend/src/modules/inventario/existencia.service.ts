import type { EntityManager } from 'typeorm';
import { HttpError } from '../../utils/http-error';
import { almacenRepository } from '../almacenes/almacen.repository';
import { empresaIdActual } from '../../database/tenant-context';
import { insumoRepository } from '../insumos/insumo.repository';
import { productoRepository } from '../productos/producto.repository';
import { TipoProducto } from '../productos/producto.entity';
import { usuarioRepository } from '../usuarios/usuario.repository';
import { obtenerRecetaDeProducto } from '../recetas/receta.service';
import { existenciaRepository } from './existencia.repository';
import { esMovimientoDeEntrada, Existencia, TipoMovimientoExistencia } from './existencia.entity';
import type { RegistrarMovimientoExistenciaDto } from './existencia.dto';
import type { Comanda } from '../cocina/comanda.entity';
import type { Pedido } from '../pedidos/pedido.entity';
import type { Venta } from '../ventas/venta.entity';
import type { LineaVentaDto } from '../ventas/venta.dto';
import type { Almacen } from '../almacenes/almacen.entity';
import type { Compra } from '../compras/compra.entity';
import type { DetalleCompra } from '../compras/detalle-compra.entity';
import type { Usuario } from '../usuarios/usuario.entity';

const RELACIONES_MOVIMIENTO = {
  almacen: true,
  insumo: { unidadMedida: true },
  producto: true,
  usuario: { personal: true },
} as const;

function ordenarPorFecha(existencias: Existencia[]): Existencia[] {
  return [...existencias].sort((a, b) => b.creadoEn.getTime() - a.creadoEn.getTime());
}

export async function listarMovimientos(filtros: {
  almacenId?: string;
  insumoId?: string;
  productoId?: string;
}): Promise<Existencia[]> {
  const movimientos = await existenciaRepository.find({
    where: {
      ...(filtros.almacenId ? { almacen: { id: filtros.almacenId } } : {}),
      ...(filtros.insumoId ? { insumo: { id: filtros.insumoId } } : {}),
      ...(filtros.productoId ? { producto: { id: filtros.productoId } } : {}),
    },
    relations: RELACIONES_MOVIMIENTO,
    order: { creadoEn: 'DESC' },
  });
  return ordenarPorFecha(movimientos);
}

interface ItemStock {
  almacenId: string;
  insumoId: string | null;
  productoId: string | null;
  stock: number;
}

/**
 * Saldo actual de cada ítem (insumo o producto mercadería) por almacén — suma con signo de
 * todos sus movimientos. Se calcula agregando en SQL en vez de traer todo el historial a
 * memoria: un kardex real puede acumular miles de filas por ítem.
 */
export async function listarStockConsolidado(): Promise<ItemStock[]> {
  const filas: Array<{
    almacen_id: string;
    insumo_id: string | null;
    producto_id: string | null;
    stock: string;
  }> = await existenciaRepository.query(`
    SELECT
      almacen_id,
      insumo_id,
      producto_id,
      SUM(CASE WHEN tipo IN ('inicial', 'compra', 'ajuste_entrada', 'anulacion_venta') THEN cantidad ELSE -cantidad END) AS stock
    FROM existencias
    GROUP BY almacen_id, insumo_id, producto_id
  `);
  return filas.map((fila) => ({
    almacenId: fila.almacen_id,
    insumoId: fila.insumo_id,
    productoId: fila.producto_id,
    stock: Number(fila.stock),
  }));
}

/** Último costo de compra conocido de cada insumo — el `costoUnitario` de su movimiento de
 * entrada más reciente (cualquier almacén), usado para estimar el costo de una receta. Un
 * insumo que nunca se compró (o se compró sin registrar costo) no aparece en el mapa. */
export async function obtenerUltimosCostosInsumos(): Promise<Map<string, number>> {
  const filas: Array<{ insumo_id: string; costo_unitario: string }> =
    await existenciaRepository.query(`
    SELECT DISTINCT ON (insumo_id) insumo_id, costo_unitario
    FROM existencias
    WHERE insumo_id IS NOT NULL AND costo_unitario IS NOT NULL
    ORDER BY insumo_id, creado_en DESC
  `);
  return new Map(filas.map((fila) => [fila.insumo_id, Number(fila.costo_unitario)]));
}

/** De dónde salió el costo neto de un ítem: de una compra registrada (con su desglose de
 * IGV real) o de un movimiento manual, donde el monto se tomó tal cual se tipeó. */
export type OrigenCosto = 'compra' | 'manual';

export interface CostoNeto {
  /** Costo unitario SIN IGV — es el que se compara contra el valor de venta al calcular
   * margen. `existencias.costo_unitario` no sirve para eso: guarda el monto tal como se
   * tipeó, que en una compra con `incluyeIgv` trae el IGV adentro. */
  costo: number;
  origen: OrigenCosto;
}

export interface CostosNetos {
  insumos: Map<string, CostoNeto>;
  productos: Map<string, CostoNeto>;
}

interface FilaCostoNeto {
  insumo_id: string | null;
  producto_id: string | null;
  costo: string | null;
  origen: OrigenCosto;
}

/**
 * Último costo unitario neto de IGV conocido por ítem (insumo y producto mercadería), desde
 * el movimiento de entrada más reciente en cualquier almacén. Base del costeo de recetas
 * (`modules/recetas/costeo.service.ts`).
 *
 * Cuando el movimiento vino de una `Compra` se usa `detalle_compras.valor_compra / cantidad`,
 * que ya está desglosado según el `tipoAfectacionIgv` del propio ítem y el `incluyeIgv` de esa
 * compra. Un movimiento manual (`inicial`/`ajuste_entrada`/compra sin proveedor) no tiene ese
 * desglose: ahí se toma `costo_unitario` tal cual y se marca `origen: 'manual'`, para que la
 * interfaz pueda advertir que ese costo no pasó por un comprobante.
 *
 * Es distinto de `obtenerUltimosCostosInsumos`, que devuelve el monto bruto tal como se tipeó
 * (lo que efectivamente se pagó) y se sigue usando para sugerir el costo en una compra nueva.
 */
export async function obtenerCostosNetos(): Promise<CostosNetos> {
  const filas: FilaCostoNeto[] = await existenciaRepository.query(`
    SELECT DISTINCT ON (e.insumo_id, e.producto_id)
           e.insumo_id,
           e.producto_id,
           COALESCE(dc.valor_compra / NULLIF(dc.cantidad, 0), e.costo_unitario) AS costo,
           CASE WHEN dc.id IS NULL THEN 'manual' ELSE 'compra' END AS origen
    FROM existencias e
    LEFT JOIN detalle_compras dc
      ON dc.compra_id = e.compra_id
     AND dc.insumo_id IS NOT DISTINCT FROM e.insumo_id
     AND dc.producto_id IS NOT DISTINCT FROM e.producto_id
    WHERE e.costo_unitario IS NOT NULL
      -- No incluye 'anulacion_venta': es una entrada real (devuelve stock), pero no un evento
      -- de costeo — no trae costo_unitario propio (ver anularSalidasVenta), así que igual
      -- quedaría fuera del filtro de arriba. Se deja explícito para que la lista siga leyéndose
      -- como "tipos de entrada con costo", no "todos los tipos de entrada".
      AND e.tipo IN ('inicial', 'compra', 'ajuste_entrada')
    ORDER BY e.insumo_id, e.producto_id, e.creado_en DESC
  `);

  const costos: CostosNetos = { insumos: new Map(), productos: new Map() };
  for (const fila of filas) {
    if (fila.costo === null) continue;
    const valor: CostoNeto = { costo: Number(fila.costo), origen: fila.origen };
    if (fila.insumo_id) costos.insumos.set(fila.insumo_id, valor);
    else if (fila.producto_id) costos.productos.set(fila.producto_id, valor);
  }
  return costos;
}

export async function calcularStock(
  almacenId: string,
  item: { insumoId: string } | { productoId: string },
): Promise<number> {
  const resultado: Array<{ stock: string | null }> = await existenciaRepository.query(
    `SELECT SUM(CASE WHEN tipo IN ('inicial', 'compra', 'ajuste_entrada', 'anulacion_venta') THEN cantidad ELSE -cantidad END) AS stock
     FROM existencias
     WHERE almacen_id = $1 AND ${'insumoId' in item ? 'insumo_id' : 'producto_id'} = $2`,
    [almacenId, 'insumoId' in item ? item.insumoId : item.productoId],
  );
  return Number(resultado[0]?.stock ?? 0);
}

/** Almacén donde se registran los movimientos automáticos (consumo de cocina, venta directa)
 * cuando nadie elige uno a mano: el almacén marcado como principal
 * de la empresa de la petición en curso. `null` si todavía no se configuró ningún almacén
 * principal — en ese caso los movimientos automáticos simplemente no se registran (Inventario
 * es un módulo nuevo; Pedidos/Cocina/Ventas deben seguir funcionando igual para quien no lo
 * haya configurado todavía, mismo criterio de degradación que `obtenerEmpresaPublica`). */
async function obtenerAlmacenPorDefecto() {
  return almacenRepository.findOne({
    where: { empresa: { id: empresaIdActual() }, esPrincipal: true, activo: true },
  });
}

export async function registrarMovimientoManual(
  usuarioId: string,
  dto: RegistrarMovimientoExistenciaDto,
): Promise<Existencia> {
  const almacen = await almacenRepository.findOneBy({ id: dto.almacenId });
  if (!almacen) {
    throw new HttpError(400, 'El almacén indicado no existe', ['almacenId inválido']);
  }

  let insumo = null;
  let producto = null;
  if (dto.insumoId) {
    insumo = await insumoRepository.findOneBy({ id: dto.insumoId });
    if (!insumo) throw new HttpError(400, 'El insumo indicado no existe', ['insumoId inválido']);
  } else if (dto.productoId) {
    producto = await productoRepository.findOneBy({ id: dto.productoId });
    if (!producto) {
      throw new HttpError(400, 'El producto indicado no existe', ['productoId inválido']);
    }
    if (producto.tipo !== TipoProducto.MERCADERIA) {
      throw new HttpError(400, 'Solo un producto tipo "mercadería" puede tener stock propio');
    }
  }

  const usuario = await usuarioRepository.findOneBy({ id: usuarioId });
  if (!usuario) {
    throw new HttpError(401, 'Usuario no encontrado');
  }

  const movimiento = existenciaRepository.create({
    almacen,
    insumo,
    producto,
    tipo: dto.tipo as TipoMovimientoExistencia,
    cantidad: dto.cantidad,
    costoUnitario: esMovimientoDeEntrada(dto.tipo as TipoMovimientoExistencia)
      ? (dto.costoUnitario ?? null)
      : null,
    usuario,
    observacion: dto.observacion ?? null,
  });
  const guardado = await existenciaRepository.save(movimiento);
  return existenciaRepository.findOneOrFail({
    where: { id: guardado.id },
    relations: RELACIONES_MOVIMIENTO,
  });
}

/**
 * Consumo real al preparar un platillo: se dispara cuando `comanda.service.ts` marca una
 * comanda como `entregado`. Para cada línea de la comanda, si el producto es `servicio`
 * descuenta cada insumo de su receta (cantidad de la receta × cantidad vendida); si es
 * `mercadería` (ej. una bebida que igual pasó por cocina) descuenta su propio stock. Sin
 * almacén principal configurado, no hace nada — no bloquea el flujo de cocina.
 */
export async function registrarConsumoComanda(comanda: Comanda): Promise<void> {
  const almacen = await obtenerAlmacenPorDefecto();
  if (!almacen) return;

  for (const detalle of comanda.detalles) {
    if (detalle.producto.tipo === TipoProducto.SERVICIO) {
      const receta = await obtenerRecetaDeProducto(detalle.producto.id);
      for (const linea of receta) {
        const movimiento = existenciaRepository.create({
          almacen,
          insumo: linea.insumo,
          producto: null,
          tipo: TipoMovimientoExistencia.CONSUMO_COCINA,
          cantidad: linea.cantidad * detalle.cantidad,
          comanda,
        });
        await existenciaRepository.save(movimiento);
      }
    } else {
      const movimiento = existenciaRepository.create({
        almacen,
        insumo: null,
        producto: detalle.producto,
        tipo: TipoMovimientoExistencia.CONSUMO_COCINA,
        cantidad: detalle.cantidad,
        comanda,
      });
      await existenciaRepository.save(movimiento);
    }
  }
}

/**
 * Consumo al emitir una venta: cubre lo que `registrarConsumoComanda` no pudo anticipar —
 * líneas de una venta directa (sin pedido) y líneas de un pedido que nunca se enviaron a
 * cocina. Las líneas que sí pasaron por cocina no se vuelven a descontar aquí: solo se les
 * enlaza el `venta_id` a su movimiento `consumo_cocina` ya existente, para trazabilidad.
 */
export async function registrarConsumoVenta(
  venta: Venta,
  pedido: Pedido | null,
  lineasDirectas: LineaVentaDto[] | null,
): Promise<void> {
  const almacen = await obtenerAlmacenPorDefecto();
  if (!almacen) return;

  if (pedido) {
    // Enlaza el consumo ya registrado al entregar la comanda (si lo hubo) con esta venta.
    await existenciaRepository
      .createQueryBuilder()
      .update()
      .set({ venta: { id: venta.id } })
      .where('comanda_id IN (SELECT id FROM comandas WHERE pedido_id = :pedidoId)', {
        pedidoId: pedido.id,
      })
      .andWhere('venta_id IS NULL')
      .execute();

    // Líneas que nunca se enviaron a cocina (comanda_id null): se descuentan recién ahora.
    for (const detalle of pedido.detalles.filter((d) => !d.comanda)) {
      await registrarSalidaVentaDirecta(almacen, detalle.producto.id, detalle.cantidad, venta);
    }
    return;
  }

  if (lineasDirectas) {
    for (const linea of lineasDirectas) {
      await registrarSalidaVentaDirecta(almacen, linea.productoId, linea.cantidad, venta);
    }
  }
}

async function registrarSalidaVentaDirecta(
  almacen: NonNullable<Awaited<ReturnType<typeof obtenerAlmacenPorDefecto>>>,
  productoId: string,
  cantidadVendida: number,
  venta: Venta,
): Promise<void> {
  const producto = await productoRepository.findOneBy({ id: productoId });
  if (!producto) return;

  if (producto.tipo === TipoProducto.SERVICIO) {
    const receta = await obtenerRecetaDeProducto(productoId);
    for (const linea of receta) {
      const movimiento = existenciaRepository.create({
        almacen,
        insumo: linea.insumo,
        producto: null,
        tipo: TipoMovimientoExistencia.VENTA_DIRECTA,
        cantidad: linea.cantidad * cantidadVendida,
        venta,
      });
      await existenciaRepository.save(movimiento);
    }
  } else {
    const movimiento = existenciaRepository.create({
      almacen,
      insumo: null,
      producto,
      tipo: TipoMovimientoExistencia.VENTA_DIRECTA,
      cantidad: cantidadVendida,
      venta,
    });
    await existenciaRepository.save(movimiento);
  }
}

/** Da de alta el stock de una compra recién registrada: un movimiento `compra` por línea,
 * enlazado a la `Compra` para trazabilidad (FASE 17). Reemplaza, para el caso con proveedor,
 * el registro manual de `POST /api/existencias/movimientos` (que sigue existiendo para altas
 * sin proveedor — ej. donación, traslado). `manager` permite ejecutarlo dentro de la misma
 * transacción que `actualizarCompra` (reversa + nueva alta atómicas, ver `compra.service.ts`);
 * sin él usa el repositorio normal, como al registrar una compra nueva. */
export async function registrarEntradasCompra(
  compra: Compra,
  detalles: DetalleCompra[],
  almacen: Almacen,
  usuario: Usuario,
  manager?: EntityManager,
): Promise<void> {
  const repositorio = manager ? manager.getRepository(Existencia) : existenciaRepository;
  for (const detalle of detalles) {
    const movimiento = repositorio.create({
      almacen,
      insumo: detalle.insumo,
      producto: detalle.producto,
      tipo: TipoMovimientoExistencia.COMPRA,
      cantidad: detalle.cantidad,
      costoUnitario: detalle.costoUnitario,
      compra,
      usuario,
    });
    await repositorio.save(movimiento);
  }
}

/** Reversa el stock de una compra anulada (o de las líneas anteriores al editarla, ver
 * `compra.service.ts: actualizarCompra`): un movimiento `anulacion_compra` por cada movimiento
 * `compra` que esa compra generó — nunca se borran ni editan los originales (mismo criterio de
 * "el kardex nunca se borra" que ya rige el resto de `existencias`). Se relee desde los
 * movimientos ya guardados (no desde `detalles`) para no asumir que el almacén de cada línea
 * siguió siendo el mismo. `manager` permite ejecutarlo dentro de una transacción, ver arriba. */
export async function anularEntradasCompra(
  compra: Compra,
  usuario: Usuario,
  manager?: EntityManager,
  observacion = 'Reversa por anulación de compra',
): Promise<void> {
  const repositorio = manager ? manager.getRepository(Existencia) : existenciaRepository;
  const originales = await repositorio.find({
    where: { compra: { id: compra.id }, tipo: TipoMovimientoExistencia.COMPRA },
    relations: { almacen: true, insumo: true, producto: true },
  });
  for (const original of originales) {
    const reversa = repositorio.create({
      almacen: original.almacen,
      insumo: original.insumo,
      producto: original.producto,
      tipo: TipoMovimientoExistencia.ANULACION_COMPRA,
      cantidad: original.cantidad,
      compra,
      usuario,
      observacion,
    });
    await repositorio.save(reversa);
  }
}

/**
 * Reversa el stock que se descontó al emitir una venta anulada — llamado desde
 * `venta.service.ts: anularVenta`.
 *
 * Solo revierte movimientos `venta_directa`: los que existen únicamente porque esa venta se
 * emitió (una línea sin pedido, o una línea de un pedido que nunca pasó por cocina). Un
 * `consumo_cocina` **nunca** se revierte acá aunque tenga esta misma `venta_id` enlazada
 * (`registrarConsumoVenta` los enlaza para trazabilidad): ese descuento ocurrió cuando el
 * platillo físicamente se sirvió, antes de que existiera ningún comprobante — anular la
 * venta típicamente corrige un error de cobro, no deshace que el cliente se comió el plato.
 * Mismo criterio de "nunca se borra el original" que `anularEntradasCompra`.
 */
export async function anularSalidasVenta(
  venta: Venta,
  usuario: Usuario,
  observacion = 'Reversa por anulación de venta',
): Promise<void> {
  const originales = await existenciaRepository.find({
    where: { venta: { id: venta.id }, tipo: TipoMovimientoExistencia.VENTA_DIRECTA },
    relations: { almacen: true, insumo: true, producto: true },
  });
  for (const original of originales) {
    const reversa = existenciaRepository.create({
      almacen: original.almacen,
      insumo: original.insumo,
      producto: original.producto,
      tipo: TipoMovimientoExistencia.ANULACION_VENTA,
      cantidad: original.cantidad,
      venta,
      usuario,
      observacion,
    });
    await existenciaRepository.save(reversa);
  }
}
