import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarRange,
  ChartColumn,
  Clock,
  Contact,
  CreditCard,
  Download,
  FileSpreadsheet,
  Printer,
  Receipt,
  ShoppingBag,
  Tags,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import * as reportesService from '../services/reportes.service';
import { Panel } from '../components/ui/Panel';
import { KpiCard } from '../components/ui/KpiCard';
import { Table } from '../components/ui/Table';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { GraficoArea } from '../components/charts/GraficoArea';
import { GraficoBarras } from '../components/charts/GraficoBarras';
import { GraficoDona } from '../components/charts/GraficoDona';
import { GraficoRanking } from '../components/charts/GraficoRanking';
import { formatearNumero, formatearPrecio, formatearPrecioCompacto } from '../utils/formato';
import { mensajeError } from '../utils/errores';
import { exportarCsv, imprimir } from '../utils/exportar';
import type { PuntoSerie } from '../utils/metricas';
import type { ClienteReporte, ProductoReporte, ProveedorReporte, PuntoReporte } from '../types/api';

/** Formato 'YYYY-MM-DD' en hora local (no UTC): `toISOString()` de un 1 de mes a las 00:00 en
 * Lima devuelve el día anterior, que descuadraría el rango pedido al backend. */
function aFechaIso(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

function sumarDias(fecha: Date, dias: number): Date {
  const copia = new Date(fecha);
  copia.setDate(copia.getDate() + dias);
  return copia;
}

interface Preset {
  etiqueta: string;
  calcular: () => { desde: string; hasta: string };
}

const PRESETS: Preset[] = [
  {
    etiqueta: 'Hoy',
    calcular: () => ({ desde: aFechaIso(new Date()), hasta: aFechaIso(new Date()) }),
  },
  {
    etiqueta: '7 días',
    calcular: () => ({ desde: aFechaIso(sumarDias(new Date(), -6)), hasta: aFechaIso(new Date()) }),
  },
  {
    etiqueta: '30 días',
    calcular: () => ({
      desde: aFechaIso(sumarDias(new Date(), -29)),
      hasta: aFechaIso(new Date()),
    }),
  },
  {
    etiqueta: 'Este mes',
    calcular: () => {
      const hoy = new Date();
      return {
        desde: aFechaIso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)),
        hasta: aFechaIso(hoy),
      };
    },
  },
  {
    etiqueta: 'Mes anterior',
    calcular: () => {
      const hoy = new Date();
      return {
        desde: aFechaIso(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)),
        hasta: aFechaIso(new Date(hoy.getFullYear(), hoy.getMonth(), 0)),
      };
    },
  },
];

/** El backend devuelve `{etiqueta, valor}`; los gráficos piden además un `detalle` para el
 * tooltip. Para las series de fecha se expande la etiqueta ISO a algo legible. */
function aSerie(puntos: PuntoReporte[], comoFecha = false): PuntoSerie[] {
  return puntos.map((punto) => {
    if (!comoFecha)
      return { etiqueta: punto.etiqueta, detalle: punto.etiqueta, valor: punto.valor };
    const [anio, mes, dia] = punto.etiqueta.split('-').map(Number);
    const fecha = new Date(anio, mes - 1, dia);
    return {
      etiqueta: new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short' }).format(fecha),
      detalle: new Intl.DateTimeFormat('es-PE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(fecha),
      valor: punto.valor,
    };
  });
}

function BotonExportar({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="no-imprimir flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
    >
      <FileSpreadsheet className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

export function Reportes() {
  const inicial = PRESETS[1].calcular();
  const [rango, setRango] = useState(inicial);
  const [presetActivo, setPresetActivo] = useState<string | null>(PRESETS[1].etiqueta);

  const reporteQuery = useQuery({
    queryKey: ['reporte', rango.desde, rango.hasta],
    queryFn: () => reportesService.obtenerReporte(rango),
  });
  const reporte = reporteQuery.data;

  function aplicarPreset(preset: Preset) {
    setRango(preset.calcular());
    setPresetActivo(preset.etiqueta);
  }

  function cambiarFecha(campo: 'desde' | 'hasta', valor: string) {
    if (!valor) return;
    setPresetActivo(null);
    setRango((previo) => {
      const nuevo = { ...previo, [campo]: valor };
      // Evita pedir un rango invertido, que el backend rechazaría con 400.
      if (nuevo.desde > nuevo.hasta) {
        return campo === 'desde' ? { desde: valor, hasta: valor } : { desde: valor, hasta: valor };
      }
      return nuevo;
    });
  }

  const sufijoArchivo = useMemo(() => `${rango.desde}_a_${rango.hasta}`, [rango]);

  const rotuloRango = useMemo(() => {
    const formatear = (iso: string) => {
      const [anio, mes, dia] = iso.split('-').map(Number);
      return new Intl.DateTimeFormat('es-PE', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).format(new Date(anio, mes - 1, dia));
    };
    return rango.desde === rango.hasta
      ? formatear(rango.desde)
      : `${formatear(rango.desde)} — ${formatear(rango.hasta)}`;
  }, [rango]);

  const hayVentas = (reporte?.resumen.numeroVentas ?? 0) > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Reportes</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Analítica del negocio · <span className="font-medium text-zinc-700">{rotuloRango}</span>
          </p>
        </div>

        <div className="no-imprimir flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={imprimir}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            <Printer className="h-4 w-4" />
            PDF
          </button>
          <button
            type="button"
            disabled={!reporte}
            onClick={() =>
              reporte &&
              exportarCsv<{ concepto: string; valor: string }>(
                `resumen_${sufijoArchivo}`,
                [
                  { encabezado: 'Concepto', valor: (f) => f.concepto },
                  { encabezado: 'Valor', valor: (f) => f.valor },
                ],
                [
                  { concepto: 'Desde', valor: reporte.desde },
                  { concepto: 'Hasta', valor: reporte.hasta },
                  { concepto: 'Ventas (total)', valor: reporte.resumen.ventasTotal.toFixed(2) },
                  {
                    concepto: 'Ventas (sin IGV)',
                    valor: reporte.resumen.ventasSubtotal.toFixed(2),
                  },
                  { concepto: 'IGV', valor: reporte.resumen.ventasIgv.toFixed(2) },
                  { concepto: 'N.º de ventas', valor: String(reporte.resumen.numeroVentas) },
                  { concepto: 'Ticket promedio', valor: reporte.resumen.ticketPromedio.toFixed(2) },
                  {
                    concepto: 'Clientes atendidos',
                    valor: String(reporte.resumen.clientesAtendidos),
                  },
                  { concepto: 'Compras (total)', valor: reporte.resumen.comprasTotal.toFixed(2) },
                  { concepto: 'Margen bruto', valor: reporte.resumen.margenBruto.toFixed(2) },
                ],
              )
            }
            className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Excel
          </button>
        </div>
      </div>

      {/* Selector de rango */}
      <div className="no-imprimir flex flex-wrap items-end gap-4 rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.etiqueta}
              type="button"
              onClick={() => aplicarPreset(preset)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                presetActivo === preset.etiqueta
                  ? 'bg-orange-600 text-white shadow-sm shadow-orange-600/25'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {preset.etiqueta}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor="reporte-desde"
              className="mb-1.5 block text-xs font-medium text-zinc-500"
            >
              Desde
            </label>
            <input
              id="reporte-desde"
              type="date"
              value={rango.desde}
              max={rango.hasta}
              onChange={(evento) => cambiarFecha('desde', evento.target.value)}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="reporte-hasta"
              className="mb-1.5 block text-xs font-medium text-zinc-500"
            >
              Hasta
            </label>
            <input
              id="reporte-hasta"
              type="date"
              value={rango.hasta}
              min={rango.desde}
              onChange={(evento) => cambiarFecha('hasta', evento.target.value)}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {reporteQuery.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {mensajeError(reporteQuery.error, 'No se pudo cargar el reporte')}
        </div>
      ) : reporteQuery.isLoading || !reporte ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <KpiCard
              etiqueta="Ventas del período"
              valor={reporte.resumen.ventasTotal}
              formatear={formatearPrecio}
              icono={Receipt}
              tono="naranja"
              detalle={`${formatearNumero(reporte.resumen.numeroVentas)} comprobantes emitidos`}
              tendencia={reporte.ventasPorDia.map((punto) => punto.valor)}
            />
            <KpiCard
              etiqueta="Ticket promedio"
              valor={reporte.resumen.ticketPromedio}
              formatear={formatearPrecio}
              icono={TrendingUp}
              tono="esmeralda"
              detalle="Promedio por comprobante"
            />
            <KpiCard
              etiqueta="Clientes atendidos"
              valor={reporte.resumen.clientesAtendidos}
              formatear={formatearNumero}
              icono={Users}
              tono="azul"
              detalle="Distintos, con documento registrado"
            />
            <KpiCard
              etiqueta="IGV de ventas"
              valor={reporte.resumen.ventasIgv}
              formatear={formatearPrecio}
              icono={Wallet}
              tono="violeta"
              detalle={`Base imponible ${formatearPrecio(reporte.resumen.ventasSubtotal)}`}
            />
            <KpiCard
              etiqueta="Compras del período"
              valor={reporte.resumen.comprasTotal}
              formatear={formatearPrecio}
              icono={ShoppingBag}
              tono="ambar"
              detalle={`${formatearNumero(reporte.resumen.numeroCompras)} compras registradas`}
            />
            <KpiCard
              etiqueta="Margen bruto"
              valor={reporte.resumen.margenBruto}
              formatear={formatearPrecio}
              icono={ChartColumn}
              tono={reporte.resumen.margenBruto >= 0 ? 'esmeralda' : 'naranja'}
              detalle="Ventas − compras, ambas sin IGV"
            />
          </div>

          {!hayVentas && (
            <div className="rounded-xl border border-zinc-200 bg-white py-12">
              <EmptyState
                icono={CalendarRange}
                titulo="No hubo ventas en este período"
                descripcion="Elige otro rango de fechas para ver la analítica."
              />
            </div>
          )}

          {hayVentas && (
            <>
              <Panel
                titulo="Evolución de las ventas"
                descripcion="Total facturado por día, IGV incluido"
                icono={TrendingUp}
                className="evitar-corte"
                acciones={
                  <BotonExportar
                    onClick={() =>
                      exportarCsv<PuntoReporte>(
                        `ventas_por_dia_${sufijoArchivo}`,
                        [
                          { encabezado: 'Fecha', valor: (f) => f.etiqueta },
                          { encabezado: 'Total vendido', valor: (f) => f.valor.toFixed(2) },
                        ],
                        reporte.ventasPorDia,
                      )
                    }
                  >
                    Excel
                  </BotonExportar>
                }
              >
                <GraficoArea
                  serie={aSerie(reporte.ventasPorDia, true)}
                  formatearValor={formatearPrecio}
                  formatearEje={formatearPrecioCompacto}
                  etiquetaSerie="Vendido"
                />
              </Panel>

              <Panel
                titulo="¿A qué hora vende el restaurante?"
                descripcion="Total facturado por franja horaria en todo el período"
                icono={Clock}
                className="evitar-corte"
                acciones={
                  <BotonExportar
                    onClick={() =>
                      exportarCsv<PuntoReporte>(
                        `ventas_por_hora_${sufijoArchivo}`,
                        [
                          { encabezado: 'Hora', valor: (f) => f.etiqueta },
                          { encabezado: 'Total vendido', valor: (f) => f.valor.toFixed(2) },
                        ],
                        reporte.ventasPorHora,
                      )
                    }
                  >
                    Excel
                  </BotonExportar>
                }
              >
                <GraficoBarras
                  serie={aSerie(reporte.ventasPorHora)}
                  formatearValor={formatearPrecio}
                  formatearEje={formatearPrecioCompacto}
                  etiquetaSerie="Vendido"
                />
              </Panel>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Panel
                  titulo="Ventas por categoría"
                  descripcion="Participación de cada categoría en el valor vendido"
                  icono={Tags}
                  className="evitar-corte"
                >
                  {reporte.ventasPorCategoria.length === 0 ? (
                    <EmptyState icono={Tags} titulo="Sin datos en el período" />
                  ) : (
                    <GraficoDona
                      segmentos={reporte.ventasPorCategoria}
                      formatearValor={formatearPrecio}
                      etiquetaCentro="Vendido"
                    />
                  )}
                </Panel>

                <Panel
                  titulo="Ventas por medio de pago"
                  descripcion="Cómo paga el cliente"
                  icono={CreditCard}
                  className="evitar-corte"
                >
                  {reporte.ventasPorMedioPago.length === 0 ? (
                    <EmptyState icono={CreditCard} titulo="Sin datos en el período" />
                  ) : (
                    <GraficoDona
                      segmentos={reporte.ventasPorMedioPago}
                      formatearValor={formatearPrecio}
                      etiquetaCentro="Cobrado"
                    />
                  )}
                </Panel>
              </div>

              <Panel
                titulo="Productos más vendidos"
                descripcion="Top 10 por valor vendido en el período"
                icono={ChartColumn}
                className="evitar-corte"
                acciones={
                  <BotonExportar
                    onClick={() =>
                      exportarCsv<ProductoReporte>(
                        `top_productos_${sufijoArchivo}`,
                        [
                          { encabezado: 'Producto', valor: (f) => f.nombre },
                          { encabezado: 'Categoría', valor: (f) => f.categoria },
                          { encabezado: 'Unidades', valor: (f) => f.cantidad },
                          { encabezado: 'Total vendido', valor: (f) => f.total.toFixed(2) },
                        ],
                        reporte.topProductos,
                      )
                    }
                  >
                    Excel
                  </BotonExportar>
                }
              >
                {reporte.topProductos.length === 0 ? (
                  <EmptyState icono={ChartColumn} titulo="Sin productos vendidos en el período" />
                ) : (
                  <GraficoRanking
                    items={reporte.topProductos.map((producto) => ({
                      nombre: producto.nombre,
                      valor: producto.total,
                      detalle: `${formatearNumero(producto.cantidad)} u. · ${producto.categoria}`,
                    }))}
                    formatearValor={formatearPrecio}
                  />
                )}
              </Panel>

              <Panel
                titulo="Clientes (CRM)"
                descripcion="Quiénes más consumen, cuántas veces vinieron y cuándo fue su última compra"
                icono={Contact}
                className="evitar-corte"
                enlace={{ texto: 'Ver clientes', ruta: '/clientes' }}
                acciones={
                  <BotonExportar
                    onClick={() =>
                      exportarCsv<ClienteReporte>(
                        `clientes_${sufijoArchivo}`,
                        [
                          { encabezado: 'Cliente', valor: (f) => f.nombre },
                          { encabezado: 'Documento', valor: (f) => f.documento ?? '' },
                          { encabezado: 'Visitas', valor: (f) => f.visitas },
                          { encabezado: 'Total consumido', valor: (f) => f.total.toFixed(2) },
                          {
                            encabezado: 'Ticket promedio',
                            valor: (f) => f.ticketPromedio.toFixed(2),
                          },
                          {
                            encabezado: 'Última visita',
                            valor: (f) => f.ultimaVisita.slice(0, 10),
                          },
                        ],
                        reporte.clientes,
                      )
                    }
                  >
                    Excel
                  </BotonExportar>
                }
              >
                <Table
                  columnas={[
                    {
                      encabezado: 'Cliente',
                      render: (c: ClienteReporte) => (
                        <div>
                          <p className="font-medium text-zinc-900">{c.nombre}</p>
                          <p className="text-xs text-zinc-500">{c.documento ?? 'Sin documento'}</p>
                        </div>
                      ),
                    },
                    {
                      encabezado: 'Visitas',
                      render: (c: ClienteReporte) => formatearNumero(c.visitas),
                    },
                    {
                      encabezado: 'Total consumido',
                      render: (c: ClienteReporte) => (
                        <span className="font-semibold text-zinc-900">
                          {formatearPrecio(c.total)}
                        </span>
                      ),
                    },
                    {
                      encabezado: 'Ticket promedio',
                      render: (c: ClienteReporte) => formatearPrecio(c.ticketPromedio),
                    },
                    {
                      encabezado: 'Última visita',
                      render: (c: ClienteReporte) =>
                        new Intl.DateTimeFormat('es-PE', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        }).format(new Date(c.ultimaVisita)),
                    },
                  ]}
                  filas={reporte.clientes}
                  claveFila={(c) => c.id}
                  vacio="Ninguna venta del período tuvo un cliente identificado"
                />
              </Panel>

              <Panel
                titulo="Compras por proveedor"
                descripcion="A quién se le compró más en el período"
                icono={Truck}
                className="evitar-corte"
                enlace={{ texto: 'Ver compras', ruta: '/compras' }}
                acciones={
                  <BotonExportar
                    onClick={() =>
                      exportarCsv<ProveedorReporte>(
                        `compras_por_proveedor_${sufijoArchivo}`,
                        [
                          { encabezado: 'Proveedor', valor: (f) => f.nombre },
                          { encabezado: 'Documento', valor: (f) => f.documento },
                          { encabezado: 'Compras', valor: (f) => f.compras },
                          { encabezado: 'Total', valor: (f) => f.total.toFixed(2) },
                        ],
                        reporte.proveedores,
                      )
                    }
                  >
                    Excel
                  </BotonExportar>
                }
              >
                <Table
                  columnas={[
                    {
                      encabezado: 'Proveedor',
                      render: (p: ProveedorReporte) => (
                        <div>
                          <p className="font-medium text-zinc-900">{p.nombre}</p>
                          <p className="text-xs text-zinc-500">{p.documento}</p>
                        </div>
                      ),
                    },
                    {
                      encabezado: 'Compras',
                      render: (p: ProveedorReporte) => formatearNumero(p.compras),
                    },
                    {
                      encabezado: 'Total',
                      render: (p: ProveedorReporte) => (
                        <span className="font-semibold text-zinc-900">
                          {formatearPrecio(p.total)}
                        </span>
                      ),
                    },
                  ]}
                  filas={reporte.proveedores}
                  claveFila={(p) => p.documento}
                  vacio="No se registraron compras en el período"
                />
              </Panel>
            </>
          )}
        </>
      )}
    </div>
  );
}
