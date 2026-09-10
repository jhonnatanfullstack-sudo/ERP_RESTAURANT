import { ventaRepository } from '../ventas/venta.repository';
import type { RangoReporteDto } from './reporte.dto';

/**
 * Los reportes agrupan por día/hora *local*, no UTC: `creado_en` es `timestamptz`, así que una
 * venta de las 20:00 en Lima se guarda como 01:00 UTC del día siguiente. Sin convertir la zona,
 * la venta de la cena aparecería en el día equivocado y la franja horaria sería inservible.
 */
const ZONA_HORARIA = 'America/Lima';

/** Expresión SQL de la fecha/hora local de una venta. */
const FECHA_LOCAL = `(v.creado_en AT TIME ZONE '${ZONA_HORARIA}')`;

/** Solo cuentan las ventas vigentes: una anulada no es venta. */
const VENTA_VIGENTE = `v.estado = 'emitida'`;
/** Ídem para compras: una compra anulada ya fue reversada en el kardex. */
const COMPRA_VIGENTE = `c.estado = 'registrada'`;

const MAXIMO_RANKING = 10;
const MAXIMO_CLIENTES = 20;

export interface PuntoSerie {
  etiqueta: string;
  valor: number;
}

export interface ResumenReporte {
  ventasTotal: number;
  ventasSubtotal: number;
  ventasIgv: number;
  numeroVentas: number;
  ticketPromedio: number;
  clientesAtendidos: number;
  comprasTotal: number;
  numeroCompras: number;
  /** Ventas (sin IGV) menos compras (sin IGV) del período. No es utilidad contable: no
   * descuenta planilla, alquiler ni servicios — es el margen bruto de mercadería. */
  margenBruto: number;
}

export interface ItemRankingProducto {
  nombre: string;
  categoria: string;
  cantidad: number;
  total: number;
}

export interface ItemClienteCrm {
  id: string;
  nombre: string;
  documento: string | null;
  visitas: number;
  total: number;
  ticketPromedio: number;
  ultimaVisita: string;
}

export interface ItemProveedor {
  nombre: string;
  documento: string;
  compras: number;
  total: number;
}

export interface ReporteCompleto {
  desde: string;
  hasta: string;
  resumen: ResumenReporte;
  ventasPorDia: PuntoSerie[];
  ventasPorHora: PuntoSerie[];
  ventasPorCategoria: PuntoSerie[];
  ventasPorMedioPago: PuntoSerie[];
  ventasPorTipoComprobante: PuntoSerie[];
  topProductos: ItemRankingProducto[];
  clientes: ItemClienteCrm[];
  proveedores: ItemProveedor[];
}

/** Nombre a mostrar de un cliente/proveedor: razón social si es empresa, si no nombre+apellidos.
 * Misma regla que `nombreCliente` del frontend, aplicada acá porque el reporte se exporta como
 * texto plano y no puede resolverse en la vista. */
function nombreMostrado(
  razonSocial: string | null,
  nombres: string | null,
  apellidos: string | null,
): string {
  if (razonSocial) return razonSocial;
  const completo = `${nombres ?? ''} ${apellidos ?? ''}`.trim();
  return completo || 'Sin nombre';
}

function aNumero(valor: string | number | null): number {
  return valor === null ? 0 : Number(valor);
}

async function obtenerResumen(rango: RangoReporteDto): Promise<ResumenReporte> {
  const [ventas]: Array<{
    numero: string;
    total: string;
    subtotal: string;
    igv: string;
    clientes: string;
  }> = await ventaRepository.query(
    `SELECT COUNT(*)::text AS numero,
            COALESCE(SUM(v.total), 0)::text AS total,
            COALESCE(SUM(v.subtotal), 0)::text AS subtotal,
            COALESCE(SUM(v.igv), 0)::text AS igv,
            COUNT(DISTINCT v.cliente_id)::text AS clientes
     FROM ventas v
     WHERE ${VENTA_VIGENTE} AND ${FECHA_LOCAL}::date BETWEEN $1::date AND $2::date`,
    [rango.desde, rango.hasta],
  );

  const [compras]: Array<{ numero: string; total: string; subtotal: string }> =
    await ventaRepository.query(
      `SELECT COUNT(*)::text AS numero,
              COALESCE(SUM(c.total), 0)::text AS total,
              COALESCE(SUM(c.subtotal), 0)::text AS subtotal
       FROM compras c
       WHERE ${COMPRA_VIGENTE} AND c.fecha_emision BETWEEN $1::date AND $2::date`,
      [rango.desde, rango.hasta],
    );

  const numeroVentas = aNumero(ventas.numero);
  const ventasTotal = aNumero(ventas.total);
  const ventasSubtotal = aNumero(ventas.subtotal);

  return {
    ventasTotal,
    ventasSubtotal,
    ventasIgv: aNumero(ventas.igv),
    numeroVentas,
    ticketPromedio: numeroVentas === 0 ? 0 : Math.round((ventasTotal / numeroVentas) * 100) / 100,
    clientesAtendidos: aNumero(ventas.clientes),
    comprasTotal: aNumero(compras.total),
    numeroCompras: aNumero(compras.numero),
    margenBruto: Math.round((ventasSubtotal - aNumero(compras.subtotal)) * 100) / 100,
  };
}

/** Serie diaria sin huecos: `generate_series` produce todos los días del rango, y los que no
 * tuvieron venta quedan en 0 (una línea con huecos se lee como "no hay dato", no como "no
 * vendimos"). */
async function obtenerVentasPorDia(rango: RangoReporteDto): Promise<PuntoSerie[]> {
  const filas: Array<{ etiqueta: string; valor: string }> = await ventaRepository.query(
    `SELECT to_char(dia::date, 'YYYY-MM-DD') AS etiqueta,
            COALESCE(SUM(v.total), 0)::text AS valor
     FROM generate_series($1::date, $2::date, '1 day') AS dia
     LEFT JOIN ventas v
       ON ${FECHA_LOCAL}::date = dia::date AND ${VENTA_VIGENTE}
     GROUP BY dia
     ORDER BY dia`,
    [rango.desde, rango.hasta],
  );
  return filas.map((fila) => ({ etiqueta: fila.etiqueta, valor: aNumero(fila.valor) }));
}

/** Las 24 horas siempre presentes: los ceros de la madrugada son parte de la respuesta
 * ("¿a qué hora vendemos?"), no un hueco de datos. */
async function obtenerVentasPorHora(rango: RangoReporteDto): Promise<PuntoSerie[]> {
  const filas: Array<{ hora: number; valor: string }> = await ventaRepository.query(
    `SELECT hora, COALESCE(SUM(v.total), 0)::text AS valor
     FROM generate_series(0, 23) AS hora
     LEFT JOIN ventas v
       ON EXTRACT(HOUR FROM ${FECHA_LOCAL}) = hora
      AND ${VENTA_VIGENTE}
      AND ${FECHA_LOCAL}::date BETWEEN $1::date AND $2::date
     GROUP BY hora
     ORDER BY hora`,
    [rango.desde, rango.hasta],
  );
  return filas.map((fila) => ({
    etiqueta: `${String(fila.hora).padStart(2, '0')}:00`,
    valor: aNumero(fila.valor),
  }));
}

async function obtenerVentasPorCategoria(rango: RangoReporteDto): Promise<PuntoSerie[]> {
  const filas: Array<{ etiqueta: string; valor: string }> = await ventaRepository.query(
    `SELECT cat.nombre AS etiqueta, SUM(dv.subtotal)::text AS valor
     FROM detalle_ventas dv
     JOIN ventas v ON v.id = dv.venta_id
     JOIN productos p ON p.id = dv.producto_id
     JOIN categorias cat ON cat.id = p.categoria_id
     WHERE ${VENTA_VIGENTE} AND ${FECHA_LOCAL}::date BETWEEN $1::date AND $2::date
     GROUP BY cat.nombre
     ORDER BY SUM(dv.subtotal) DESC`,
    [rango.desde, rango.hasta],
  );
  return filas.map((fila) => ({ etiqueta: fila.etiqueta, valor: aNumero(fila.valor) }));
}

async function obtenerVentasPorMedioPago(rango: RangoReporteDto): Promise<PuntoSerie[]> {
  const filas: Array<{ etiqueta: string; valor: string }> = await ventaRepository.query(
    `SELECT COALESCE(mp.nombre, 'Sin especificar') AS etiqueta, SUM(v.total)::text AS valor
     FROM ventas v
     LEFT JOIN medios_pago mp ON mp.id = v.medio_pago_id
     WHERE ${VENTA_VIGENTE} AND ${FECHA_LOCAL}::date BETWEEN $1::date AND $2::date
     GROUP BY 1
     ORDER BY SUM(v.total) DESC`,
    [rango.desde, rango.hasta],
  );
  return filas.map((fila) => ({ etiqueta: fila.etiqueta, valor: aNumero(fila.valor) }));
}

async function obtenerVentasPorTipoComprobante(rango: RangoReporteDto): Promise<PuntoSerie[]> {
  const filas: Array<{ etiqueta: string; valor: string }> = await ventaRepository.query(
    `SELECT tc.nombre AS etiqueta, SUM(v.total)::text AS valor
     FROM ventas v
     JOIN tipos_comprobante tc ON tc.id = v.tipo_comprobante_id
     WHERE ${VENTA_VIGENTE} AND ${FECHA_LOCAL}::date BETWEEN $1::date AND $2::date
     GROUP BY tc.nombre
     ORDER BY SUM(v.total) DESC`,
    [rango.desde, rango.hasta],
  );
  return filas.map((fila) => ({ etiqueta: fila.etiqueta, valor: aNumero(fila.valor) }));
}

async function obtenerTopProductos(rango: RangoReporteDto): Promise<ItemRankingProducto[]> {
  const filas: Array<{ nombre: string; categoria: string; cantidad: string; total: string }> =
    await ventaRepository.query(
      `SELECT p.nombre, cat.nombre AS categoria,
              SUM(dv.cantidad)::text AS cantidad,
              SUM(dv.subtotal)::text AS total
       FROM detalle_ventas dv
       JOIN ventas v ON v.id = dv.venta_id
       JOIN productos p ON p.id = dv.producto_id
       JOIN categorias cat ON cat.id = p.categoria_id
       WHERE ${VENTA_VIGENTE} AND ${FECHA_LOCAL}::date BETWEEN $1::date AND $2::date
       GROUP BY p.id, p.nombre, cat.nombre
       ORDER BY SUM(dv.subtotal) DESC
       LIMIT ${MAXIMO_RANKING}`,
      [rango.desde, rango.hasta],
    );
  return filas.map((fila) => ({
    nombre: fila.nombre,
    categoria: fila.categoria,
    cantidad: aNumero(fila.cantidad),
    total: aNumero(fila.total),
  }));
}

/**
 * Base del CRM: quiénes son los clientes que más consumen, cuántas veces vinieron en el
 * período y cuándo fue su última compra — lo mínimo para poder fidelizar (llamar al que dejó
 * de venir, premiar al recurrente). Solo aparecen las ventas con cliente identificado.
 */
async function obtenerClientes(rango: RangoReporteDto): Promise<ItemClienteCrm[]> {
  const filas: Array<{
    id: string;
    razon_social: string | null;
    nombres: string | null;
    apellidos: string | null;
    numero_documento: string | null;
    visitas: string;
    total: string;
    ultima_visita: Date;
  }> = await ventaRepository.query(
    `SELECT cl.id, cl.razon_social, cl.nombres, cl.apellidos, cl.numero_documento,
            COUNT(v.id)::text AS visitas,
            SUM(v.total)::text AS total,
            MAX(v.creado_en) AS ultima_visita
     FROM ventas v
     JOIN clientes cl ON cl.id = v.cliente_id
     WHERE ${VENTA_VIGENTE} AND ${FECHA_LOCAL}::date BETWEEN $1::date AND $2::date
     GROUP BY cl.id
     ORDER BY SUM(v.total) DESC
     LIMIT ${MAXIMO_CLIENTES}`,
    [rango.desde, rango.hasta],
  );

  return filas.map((fila) => {
    const visitas = aNumero(fila.visitas);
    const total = aNumero(fila.total);
    return {
      id: fila.id,
      nombre: nombreMostrado(fila.razon_social, fila.nombres, fila.apellidos),
      documento: fila.numero_documento,
      visitas,
      total,
      ticketPromedio: visitas === 0 ? 0 : Math.round((total / visitas) * 100) / 100,
      ultimaVisita: new Date(fila.ultima_visita).toISOString(),
    };
  });
}

async function obtenerProveedores(rango: RangoReporteDto): Promise<ItemProveedor[]> {
  const filas: Array<{
    razon_social: string | null;
    nombres: string | null;
    apellidos: string | null;
    numero_documento: string;
    compras: string;
    total: string;
  }> = await ventaRepository.query(
    `SELECT pr.razon_social, pr.nombres, pr.apellidos, pr.numero_documento,
            COUNT(c.id)::text AS compras,
            SUM(c.total)::text AS total
     FROM compras c
     JOIN proveedores pr ON pr.id = c.proveedor_id
     WHERE ${COMPRA_VIGENTE} AND c.fecha_emision BETWEEN $1::date AND $2::date
     GROUP BY pr.id
     ORDER BY SUM(c.total) DESC
     LIMIT ${MAXIMO_RANKING}`,
    [rango.desde, rango.hasta],
  );

  return filas.map((fila) => ({
    nombre: nombreMostrado(fila.razon_social, fila.nombres, fila.apellidos),
    documento: fila.numero_documento,
    compras: aNumero(fila.compras),
    total: aNumero(fila.total),
  }));
}

/**
 * Un solo endpoint devuelve todo el tablero del período: la pantalla de Reportes necesita
 * todos los bloques a la vez y son consultas chicas y agregadas — partirlo en ocho endpoints
 * multiplicaría los viajes de red sin ganar nada.
 */
export async function obtenerReporte(rango: RangoReporteDto): Promise<ReporteCompleto> {
  const [
    resumen,
    ventasPorDia,
    ventasPorHora,
    ventasPorCategoria,
    ventasPorMedioPago,
    ventasPorTipoComprobante,
    topProductos,
    clientes,
    proveedores,
  ] = await Promise.all([
    obtenerResumen(rango),
    obtenerVentasPorDia(rango),
    obtenerVentasPorHora(rango),
    obtenerVentasPorCategoria(rango),
    obtenerVentasPorMedioPago(rango),
    obtenerVentasPorTipoComprobante(rango),
    obtenerTopProductos(rango),
    obtenerClientes(rango),
    obtenerProveedores(rango),
  ]);

  return {
    desde: rango.desde,
    hasta: rango.hasta,
    resumen,
    ventasPorDia,
    ventasPorHora,
    ventasPorCategoria,
    ventasPorMedioPago,
    ventasPorTipoComprobante,
    topProductos,
    clientes,
    proveedores,
  };
}
