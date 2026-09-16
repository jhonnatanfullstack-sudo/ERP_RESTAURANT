import type { Cobranza, Comanda, Venta } from '../types/api';

/** Código del medio de pago "Efectivo" (catálogo de Ventas) — el único que mueve el efectivo
 * físico de la caja. Mismo criterio que usa el backend al cerrar (`caja.service.ts`); acá
 * recalculado del lado del cliente, tanto para la vista previa en vivo mientras la caja sigue
 * abierta como para el reporte impreso de una sesión ya cerrada. */
export const CODIGO_MEDIO_PAGO_EFECTIVO = 'efectivo';

/** Punto de una serie temporal o categórica lista para graficar. */
export interface PuntoSerie {
  /** Etiqueta corta para el eje (ej. "07 sep"). */
  etiqueta: string;
  /** Etiqueta completa para el tooltip (ej. "dom, 7 de septiembre"). */
  detalle: string;
  valor: number;
}

/** Variación porcentual de una métrica respecto a un período anterior. */
export interface Delta {
  porcentaje: number;
  direccion: 'sube' | 'baja' | 'igual';
}

export interface ProductoVendido {
  nombre: string;
  cantidad: number;
  ingreso: number;
}

export interface Segmento {
  etiqueta: string;
  valor: number;
}

const formateadorEjeDia = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short' });
const formateadorDiaCompleto = new Intl.DateTimeFormat('es-PE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

export function inicioDelDia(fecha: Date): Date {
  const copia = new Date(fecha);
  copia.setHours(0, 0, 0, 0);
  return copia;
}

export function sumarDias(fecha: Date, dias: number): Date {
  const copia = new Date(fecha);
  copia.setDate(copia.getDate() + dias);
  return copia;
}

export function esMismoDia(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Solo las ventas válidas: las anuladas no cuentan para ninguna métrica de ingresos. */
export function soloEmitidas(ventas: Venta[]): Venta[] {
  return ventas.filter((venta) => venta.estado === 'emitida');
}

export function ventasDelDia(ventas: Venta[], fecha: Date): Venta[] {
  return ventas.filter((venta) => esMismoDia(new Date(venta.creadoEn), fecha));
}

export function ventasDesde(ventas: Venta[], desde: Date): Venta[] {
  const limite = desde.getTime();
  return ventas.filter((venta) => new Date(venta.creadoEn).getTime() >= limite);
}

export function ventasDelMes(ventas: Venta[], fecha: Date): Venta[] {
  return ventas.filter((venta) => {
    const creado = new Date(venta.creadoEn);
    return creado.getFullYear() === fecha.getFullYear() && creado.getMonth() === fecha.getMonth();
  });
}

export function sumar<T>(items: T[], valor: (item: T) => number): number {
  return items.reduce((total, item) => total + valor(item), 0);
}

export function sumarTotales(ventas: Venta[]): number {
  return sumar(ventas, (venta) => venta.total);
}

export function ticketPromedio(ventas: Venta[]): number {
  if (ventas.length === 0) return 0;
  return sumarTotales(ventas) / ventas.length;
}

/** Devuelve `null` cuando no hay base de comparación (período anterior en cero). */
export function calcularDelta(actual: number, anterior: number): Delta | null {
  if (anterior === 0) return null;
  const porcentaje = ((actual - anterior) / anterior) * 100;
  const direccion = porcentaje > 0.05 ? 'sube' : porcentaje < -0.05 ? 'baja' : 'igual';
  return { porcentaje, direccion };
}

/** Total vendido por día, incluyendo los días sin ventas para que la línea no mienta. */
export function serieVentasPorDia(ventas: Venta[], dias: number, hoy = new Date()): PuntoSerie[] {
  const puntos: PuntoSerie[] = [];
  for (let indice = dias - 1; indice >= 0; indice -= 1) {
    const fecha = sumarDias(inicioDelDia(hoy), -indice);
    const delDia = ventasDelDia(ventas, fecha);
    puntos.push({
      etiqueta: formateadorEjeDia.format(fecha),
      detalle: formateadorDiaCompleto.format(fecha),
      valor: sumarTotales(delDia),
    });
  }
  return puntos;
}

/**
 * Total vendido por hora del día acumulando el período recibido: responde
 * "¿en qué franjas horarias se concentra la venta?".
 */
export function serieVentasPorHora(ventas: Venta[]): PuntoSerie[] {
  const totales = new Array<number>(24).fill(0);
  for (const venta of ventas) {
    totales[new Date(venta.creadoEn).getHours()] += venta.total;
  }

  const conVenta = totales.reduce<number[]>(
    (indices, total, hora) => (total > 0 ? [...indices, hora] : indices),
    [],
  );
  const desde = conVenta.length > 0 ? Math.min(...conVenta) : 11;
  const hasta = conVenta.length > 0 ? Math.max(...conVenta) : 22;
  // Un rango demasiado corto deja el gráfico casi vacío: se amplía a un mínimo legible.
  const inicio = Math.max(0, Math.min(desde, hasta - 5));
  const fin = Math.min(23, Math.max(hasta, inicio + 5));

  const puntos: PuntoSerie[] = [];
  for (let hora = inicio; hora <= fin; hora += 1) {
    puntos.push({
      etiqueta: `${String(hora).padStart(2, '0')}`,
      detalle: `${String(hora).padStart(2, '0')}:00 – ${String(hora).padStart(2, '0')}:59`,
      valor: totales[hora],
    });
  }
  return puntos;
}

/** Productos más vendidos por ingreso generado, tomando el detalle de las ventas. */
export function rankingProductos(ventas: Venta[], limite = 5): ProductoVendido[] {
  const acumulado = new Map<string, ProductoVendido>();
  for (const venta of ventas) {
    for (const detalle of venta.detalles) {
      const nombre = detalle.producto?.nombre ?? detalle.descripcionProducto;
      const previo = acumulado.get(nombre);
      if (previo) {
        previo.cantidad += Number(detalle.cantidad);
        previo.ingreso += Number(detalle.subtotal);
      } else {
        acumulado.set(nombre, {
          nombre,
          cantidad: Number(detalle.cantidad),
          ingreso: Number(detalle.subtotal),
        });
      }
    }
  }
  return [...acumulado.values()].sort((a, b) => b.ingreso - a.ingreso).slice(0, limite);
}

/**
 * Participación de cada medio de pago. Los segmentos que exceden `maximo` se
 * agrupan en "Otros" para no pasar del límite legible de una dona.
 */
export function segmentosMedioPago(ventas: Venta[], maximo = 5): Segmento[] {
  const acumulado = new Map<string, number>();
  for (const venta of ventas) {
    const etiqueta =
      venta.medioPago?.nombre ?? (venta.formaPago === 'credito' ? 'Crédito' : 'Sin especificar');
    acumulado.set(etiqueta, (acumulado.get(etiqueta) ?? 0) + venta.total);
  }

  const ordenados = [...acumulado.entries()]
    .map(([etiqueta, valor]) => ({ etiqueta, valor }))
    .sort((a, b) => b.valor - a.valor);

  if (ordenados.length <= maximo) return ordenados;

  const principales = ordenados.slice(0, maximo - 1);
  const resto = ordenados.slice(maximo - 1);
  return [...principales, { etiqueta: 'Otros', valor: sumar(resto, (item) => item.valor) }];
}

/** Ventas emitidas dentro del período de una sesión de caja (abierta o ya cerrada) — base
 * tanto del estimado de efectivo como de `segmentosMedioPago` (cuánto entró en Yape, Plin,
 * tarjeta o al crédito, no solo en efectivo). Compartida entre `Caja.tsx` (vista en vivo) y
 * `ReporteCaja.tsx` (reporte impreso de una sesión): que ambos calculen lo mismo con la misma
 * función es lo que garantiza que el papel diga exactamente lo que decía la pantalla. */
export function ventasEnPeriodo(ventas: Venta[], desde: string, hasta: string | null): Venta[] {
  const inicio = new Date(desde).getTime();
  const fin = hasta ? new Date(hasta).getTime() : Date.now();
  return ventas.filter((v) => {
    if (v.estado !== 'emitida') return false;
    const momento = new Date(v.creadoEn).getTime();
    return momento >= inicio && momento <= fin;
  });
}

/** Cobros en efectivo de ventas al crédito dentro del período de la sesión — plata que entra
 * físicamente al cajón igual que una venta al contado (ver `caja.service.ts:
 * calcularPagosCreditoEfectivo`, mismo criterio del lado del backend). */
export function pagosEfectivoEnPeriodo(
  cobranzas: Cobranza[],
  desde: string,
  hasta: string | null,
): number {
  const inicio = new Date(desde).getTime();
  const fin = hasta ? new Date(hasta).getTime() : Date.now();
  return cobranzas
    .flatMap((c) => c.pagos)
    .filter((pago) => {
      if (pago.anulado || pago.medioPago.codigo !== CODIGO_MEDIO_PAGO_EFECTIVO) return false;
      const momento = new Date(pago.creadoEn).getTime();
      return momento >= inicio && momento <= fin;
    })
    .reduce((suma, pago) => suma + pago.monto, 0);
}

/** Comandas que siguen en el flujo de cocina (ni entregadas ni canceladas). */
export function comandasEnCurso(comandas: Comanda[]): Comanda[] {
  return comandas.filter(
    (comanda) => comanda.estado !== 'entregado' && comanda.estado !== 'cancelada',
  );
}

export function minutosDesde(iso: string, ahora = new Date()): number {
  return Math.max(0, Math.round((ahora.getTime() - new Date(iso).getTime()) / 60000));
}
