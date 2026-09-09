import { useMemo, useState } from 'react';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Armchair,
  Award,
  Building2,
  CalendarCheck,
  CalendarClock,
  ChartColumn,
  Contact,
  CookingPot,
  DoorOpen,
  Flame,
  Info,
  LayoutGrid,
  Receipt,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Tags,
  Timer,
  TrendingUp,
  UserCircle2,
  Users,
  Utensils,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router';
import * as usuariosService from '../services/usuarios.service';
import * as personalService from '../services/personal.service';
import * as rolesService from '../services/roles.service';
import * as empresaService from '../services/empresa.service';
import * as categoriasService from '../services/categorias.service';
import * as marcasService from '../services/marcas.service';
import * as productosService from '../services/productos.service';
import * as salonesService from '../services/salones.service';
import * as mesasService from '../services/mesas.service';
import * as clientesService from '../services/clientes.service';
import * as reservasService from '../services/reservas.service';
import * as pedidosService from '../services/pedidos.service';
import * as comandasService from '../services/comandas.service';
import * as ventasService from '../services/ventas.service';
import { useAuth } from '../context/AuthContext';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { KpiCard } from '../components/ui/KpiCard';
import { Panel } from '../components/ui/Panel';
import { Table } from '../components/ui/Table';
import { AnilloProgreso } from '../components/charts/AnilloProgreso';
import { GraficoArea } from '../components/charts/GraficoArea';
import { GraficoBarras } from '../components/charts/GraficoBarras';
import { GraficoDona } from '../components/charts/GraficoDona';
import { GraficoRanking } from '../components/charts/GraficoRanking';
import {
  calcularDelta,
  comandasEnCurso,
  esMismoDia,
  inicioDelDia,
  minutosDesde,
  rankingProductos,
  segmentosMedioPago,
  serieVentasPorDia,
  serieVentasPorHora,
  soloEmitidas,
  sumar,
  sumarDias,
  sumarTotales,
  ticketPromedio,
  ventasDelDia,
  ventasDelMes,
  ventasDesde,
} from '../utils/metricas';
import { mensajeError } from '../utils/errores';
import {
  formatearFechaLarga,
  formatearHora,
  formatearNumero,
  formatearPrecio,
  formatearPrecioCompacto,
  nombreCliente,
  nombreCortoPersonal,
  origenVenta,
} from '../utils/formato';
import type { EstadoComanda } from '../types/api';

const RANGOS = [7, 14, 30] as const;
type Rango = (typeof RANGOS)[number];

const ESTADOS_COCINA: {
  estado: EstadoComanda;
  etiqueta: string;
  icono: LucideIcon;
  clases: string;
}[] = [
  { estado: 'pendiente', etiqueta: 'En cola', icono: Timer, clases: 'bg-amber-50 text-amber-700' },
  {
    estado: 'en_preparacion',
    etiqueta: 'Preparando',
    icono: CookingPot,
    clases: 'bg-blue-50 text-blue-700',
  },
  {
    estado: 'listo',
    etiqueta: 'Listas',
    icono: Utensils,
    clases: 'bg-emerald-50 text-emerald-700',
  },
];

/** Estados de carga / error / vacío comunes a todos los paneles del dashboard. */
function ContenidoPanel({
  cargando,
  error,
  vacio,
  alto = 200,
  children,
}: {
  cargando: boolean;
  error?: string;
  vacio?: { icono: LucideIcon; titulo: string; descripcion?: string } | false;
  alto?: number;
  children: React.ReactNode;
}) {
  if (cargando) {
    return <div className="animate-pulse rounded-lg bg-zinc-100" style={{ height: alto }} />;
  }
  if (error) return <Alert tipo="error" mensaje={error} />;
  if (vacio) {
    return <EmptyState icono={vacio.icono} titulo={vacio.titulo} descripcion={vacio.descripcion} />;
  }
  return <>{children}</>;
}

/** Control segmentado del período analizado. */
function SelectorRango({ valor, onCambiar }: { valor: Rango; onCambiar: (rango: Rango) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-zinc-100 p-0.5">
      {RANGOS.map((rango) => (
        <button
          key={rango}
          type="button"
          onClick={() => onCambiar(rango)}
          aria-pressed={valor === rango}
          className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
            valor === rango
              ? 'bg-white text-zinc-900 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-700'
          }`}
        >
          {rango}d
        </button>
      ))}
    </div>
  );
}

export function Dashboard() {
  const { usuario, tienePermiso } = useAuth();
  const clienteConsultas = useQueryClient();
  const consultasEnCurso = useIsFetching();
  const [rango, setRango] = useState<Rango>(14);

  // Instante de referencia estable: todas las métricas se calculan contra el mismo momento.
  const ahora = useMemo(() => new Date(), []);

  const ventasQuery = useQuery({
    queryKey: ['ventas'],
    queryFn: () => ventasService.listarVentas(),
    enabled: tienePermiso('ventas.ver'),
  });
  const pedidosQuery = useQuery({
    queryKey: ['pedidos'],
    queryFn: pedidosService.listarPedidos,
    enabled: tienePermiso('pedidos.ver'),
  });
  const comandasQuery = useQuery({
    queryKey: ['comandas'],
    queryFn: comandasService.listarComandas,
    enabled: tienePermiso('cocina.ver'),
  });
  const mesasQuery = useQuery({
    queryKey: ['mesas'],
    queryFn: mesasService.listarMesas,
    enabled: tienePermiso('mesas.ver'),
  });
  const reservasQuery = useQuery({
    queryKey: ['reservas'],
    queryFn: reservasService.listarReservas,
    enabled: tienePermiso('reservas.ver'),
  });
  const categoriasQuery = useQuery({
    queryKey: ['categorias'],
    queryFn: categoriasService.listarCategorias,
    enabled: tienePermiso('categorias.ver'),
  });
  const marcasQuery = useQuery({
    queryKey: ['marcas'],
    queryFn: marcasService.listarMarcas,
    enabled: tienePermiso('marcas.ver'),
  });
  const productosQuery = useQuery({
    queryKey: ['productos'],
    queryFn: productosService.listarProductos,
    enabled: tienePermiso('productos.ver'),
  });
  const salonesQuery = useQuery({
    queryKey: ['salones'],
    queryFn: salonesService.listarSalones,
    enabled: tienePermiso('salones.ver'),
  });
  const clientesQuery = useQuery({
    queryKey: ['clientes'],
    queryFn: clientesService.listarClientes,
    enabled: tienePermiso('clientes.ver'),
  });
  const usuariosQuery = useQuery({
    queryKey: ['usuarios'],
    queryFn: usuariosService.listarUsuarios,
    enabled: tienePermiso('usuarios.ver'),
  });
  const personalQuery = useQuery({
    queryKey: ['personal'],
    queryFn: personalService.listarPersonal,
    enabled: tienePermiso('personal.ver'),
  });
  const rolesQuery = useQuery({
    queryKey: ['roles'],
    queryFn: rolesService.listarRoles,
    enabled: tienePermiso('roles.ver'),
  });
  const empresasQuery = useQuery({
    queryKey: ['empresas'],
    queryFn: empresaService.listarEmpresas,
    enabled: tienePermiso('empresa.ver'),
  });

  const metricas = useMemo(() => {
    const emitidas = soloEmitidas(ventasQuery.data ?? []);
    const deHoy = ventasDelDia(emitidas, ahora);
    const deAyer = ventasDelDia(emitidas, sumarDias(inicioDelDia(ahora), -1));
    const delMes = ventasDelMes(emitidas, ahora);

    // Un balde por cada uno de los últimos 7 días: alimenta los micrográficos de las tarjetas.
    const semana = Array.from({ length: 7 }, (_, indice) =>
      ventasDelDia(emitidas, sumarDias(inicioDelDia(ahora), -(6 - indice))),
    );

    const ultimos7 = ventasDesde(emitidas, sumarDias(inicioDelDia(ahora), -6));
    const ultimos30 = ventasDesde(emitidas, sumarDias(inicioDelDia(ahora), -29));
    const serieRango = serieVentasPorDia(emitidas, rango, ahora);

    return {
      emitidas,
      totalHoy: sumarTotales(deHoy),
      totalAyer: sumarTotales(deAyer),
      comprobantesHoy: deHoy.length,
      comprobantesAyer: deAyer.length,
      ticketHoy: ticketPromedio(deHoy),
      ticketAyer: ticketPromedio(deAyer),
      totalMes: sumarTotales(delMes),
      igvMes: sumar(delMes, (venta) => venta.igv),
      comprobantesMes: delMes.length,
      tendenciaTotal: semana.map(sumarTotales),
      tendenciaTicket: semana.map(ticketPromedio),
      tendenciaComprobantes: semana.map((dia) => dia.length),
      serieRango,
      totalRango: sumar(serieRango, (punto) => punto.valor),
      serieHoras: serieVentasPorHora(ultimos7),
      ranking: rankingProductos(ultimos30, 5),
      medios: segmentosMedioPago(ultimos30, 5),
      ultimas: [...emitidas]
        .sort((a, b) => new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime())
        .slice(0, 6),
    };
  }, [ventasQuery.data, ahora, rango]);

  const operacion = useMemo(() => {
    const pedidosAbiertos = (pedidosQuery.data ?? []).filter(
      (pedido) => pedido.estado === 'abierto',
    );
    const mesasActivas = (mesasQuery.data ?? []).filter((mesa) => mesa.activo);
    // Un pedido "para llevar" (sin mesa) no ocupa ninguna mesa: se excluye del cálculo.
    const idsOcupadas = new Set(
      pedidosAbiertos.filter((pedido) => pedido.mesa).map((pedido) => pedido.mesa!.id),
    );
    const enCurso = comandasEnCurso(comandasQuery.data ?? []);
    const reservas = (reservasQuery.data ?? []).filter(
      (reserva) => reserva.estado !== 'cancelada' && esMismoDia(new Date(reserva.fechaHora), ahora),
    );

    return {
      pedidosAbiertos,
      porCobrar: sumar(pedidosAbiertos, (pedido) => pedido.total),
      mesasActivas,
      ocupadas: mesasActivas.filter((mesa) => idsOcupadas.has(mesa.id)).length,
      enCurso,
      cola: [...enCurso]
        .sort((a, b) => new Date(a.creadoEn).getTime() - new Date(b.creadoEn).getTime())
        .slice(0, 4),
      agenda: reservas
        .filter((reserva) => reserva.estado === 'pendiente' || reserva.estado === 'confirmada')
        .sort((a, b) => new Date(a.fechaHora).getTime() - new Date(b.fechaHora).getTime())
        .slice(0, 5),
      reservasHoy: reservas.length,
    };
  }, [pedidosQuery.data, mesasQuery.data, comandasQuery.data, reservasQuery.data, ahora]);

  // Solo se muestran los accesos de los módulos que el rol puede ver.
  const accesos = [
    {
      etiqueta: 'Categorías',
      ruta: '/categorias',
      permiso: 'categorias.ver',
      icono: Tags,
      query: categoriasQuery,
    },
    {
      etiqueta: 'Marcas',
      ruta: '/marcas',
      permiso: 'marcas.ver',
      icono: Award,
      query: marcasQuery,
    },
    {
      etiqueta: 'Productos',
      ruta: '/productos',
      permiso: 'productos.ver',
      icono: UtensilsCrossed,
      query: productosQuery,
    },
    {
      etiqueta: 'Salones',
      ruta: '/salones',
      permiso: 'salones.ver',
      icono: DoorOpen,
      query: salonesQuery,
    },
    { etiqueta: 'Mesas', ruta: '/mesas', permiso: 'mesas.ver', icono: Utensils, query: mesasQuery },
    {
      etiqueta: 'Clientes',
      ruta: '/clientes',
      permiso: 'clientes.ver',
      icono: Contact,
      query: clientesQuery,
    },
    {
      etiqueta: 'Reservas',
      ruta: '/reservas',
      permiso: 'reservas.ver',
      icono: CalendarCheck,
      query: reservasQuery,
    },
    {
      etiqueta: 'Usuarios',
      ruta: '/usuarios',
      permiso: 'usuarios.ver',
      icono: Users,
      query: usuariosQuery,
    },
    {
      etiqueta: 'Personal',
      ruta: '/personal',
      permiso: 'personal.ver',
      icono: UserCircle2,
      query: personalQuery,
    },
    {
      etiqueta: 'Roles',
      ruta: '/roles',
      permiso: 'roles.ver',
      icono: ShieldCheck,
      query: rolesQuery,
    },
    {
      etiqueta: 'Empresas',
      ruta: '/empresa',
      permiso: 'empresa.ver',
      icono: Building2,
      query: empresasQuery,
    },
  ].filter((acceso) => tienePermiso(acceso.permiso));

  const errorVentas = ventasQuery.isError
    ? mensajeError(ventasQuery.error, 'No se pudieron cargar las ventas.')
    : undefined;
  const ocupacion =
    operacion.mesasActivas.length > 0 ? operacion.ocupadas / operacion.mesasActivas.length : 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            Hola, {nombreCortoPersonal(usuario?.personal)} 👋
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Resumen de la operación · {formatearFechaLarga(ahora)}
          </p>
        </div>
        <Button
          variante="secondary"
          className="px-3 py-2"
          onClick={() => void clienteConsultas.invalidateQueries()}
          icono={
            <RefreshCw
              className={`h-4 w-4 ${consultasEnCurso > 0 ? 'animate-spin' : ''}`}
              strokeWidth={2}
            />
          }
        >
          Actualizar
        </Button>
      </header>

      <section
        className="animar-entrada grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5"
        style={{ animationDelay: '0ms' }}
      >
        <KpiCard
          etiqueta="Ventas de hoy"
          valor={metricas.totalHoy}
          formatear={formatearPrecio}
          icono={Receipt}
          tono="esmeralda"
          delta={calcularDelta(metricas.totalHoy, metricas.totalAyer)}
          detalle={`Ayer ${formatearPrecio(metricas.totalAyer)}`}
          tendencia={metricas.tendenciaTotal}
          ruta="/ventas"
          cargando={ventasQuery.isLoading}
        />
        <KpiCard
          etiqueta="Ticket promedio"
          valor={metricas.ticketHoy}
          formatear={formatearPrecio}
          icono={TrendingUp}
          tono="violeta"
          delta={calcularDelta(metricas.ticketHoy, metricas.ticketAyer)}
          detalle={`${metricas.comprobantesHoy} comprobante(s) hoy`}
          tendencia={metricas.tendenciaTicket}
          ruta="/ventas"
          cargando={ventasQuery.isLoading}
        />
        <KpiCard
          etiqueta="Comprobantes emitidos"
          valor={metricas.comprobantesHoy}
          formatear={formatearNumero}
          icono={ShoppingBag}
          tono="azul"
          delta={calcularDelta(metricas.comprobantesHoy, metricas.comprobantesAyer)}
          detalle={`Ayer ${metricas.comprobantesAyer} comprobante(s)`}
          tendencia={metricas.tendenciaComprobantes}
          ruta="/ventas"
          cargando={ventasQuery.isLoading}
        />
        <KpiCard
          etiqueta="Por cobrar en mesas"
          valor={operacion.porCobrar}
          formatear={formatearPrecio}
          icono={Wallet}
          tono="naranja"
          detalle={`${operacion.pedidosAbiertos.length} pedido(s) abierto(s)`}
          ruta="/pedidos"
          cargando={pedidosQuery.isLoading}
        />
        <KpiCard
          etiqueta="Ventas del mes"
          valor={metricas.totalMes}
          formatear={formatearPrecio}
          icono={ChartColumn}
          tono="ambar"
          detalle={`IGV ${formatearPrecio(metricas.igvMes)} · ${metricas.comprobantesMes} comprobante(s)`}
          ruta="/ventas"
          cargando={ventasQuery.isLoading}
        />
      </section>

      <div
        className="animar-entrada grid grid-cols-1 gap-4 xl:grid-cols-3"
        style={{ animationDelay: '60ms' }}
      >
        <Panel
          titulo="Evolución de ventas"
          descripcion={`${formatearPrecio(metricas.totalRango)} en ${rango} días · promedio ${formatearPrecio(metricas.totalRango / rango)} por día`}
          icono={TrendingUp}
          acciones={<SelectorRango valor={rango} onCambiar={setRango} />}
          enlace={{ texto: 'Ventas', ruta: '/ventas' }}
          className="xl:col-span-2"
        >
          <ContenidoPanel
            cargando={ventasQuery.isLoading}
            error={errorVentas}
            vacio={
              metricas.emitidas.length === 0 && {
                icono: Receipt,
                titulo: 'Aún no hay ventas registradas',
                descripcion: 'El gráfico se construye con los comprobantes emitidos.',
              }
            }
            alto={260}
          >
            <GraficoArea
              serie={metricas.serieRango}
              formatearValor={formatearPrecio}
              formatearEje={formatearPrecioCompacto}
              etiquetaSerie="Vendido"
            />
          </ContenidoPanel>
        </Panel>

        <Panel
          titulo="Medios de pago"
          descripcion="Participación de los últimos 30 días"
          icono={Wallet}
        >
          <ContenidoPanel
            cargando={ventasQuery.isLoading}
            error={errorVentas}
            vacio={
              metricas.medios.length === 0 && {
                icono: Wallet,
                titulo: 'Sin cobros en el período',
              }
            }
            alto={200}
          >
            <GraficoDona
              segmentos={metricas.medios}
              formatearValor={formatearPrecio}
              etiquetaCentro="Cobrado en 30 días"
            />
          </ContenidoPanel>
        </Panel>
      </div>

      <div
        className="animar-entrada grid grid-cols-1 gap-4 xl:grid-cols-2"
        style={{ animationDelay: '120ms' }}
      >
        <Panel
          titulo="Horas punta"
          descripcion="Venta acumulada por hora en los últimos 7 días"
          icono={Timer}
        >
          <ContenidoPanel
            cargando={ventasQuery.isLoading}
            error={errorVentas}
            vacio={
              metricas.serieHoras.every((punto) => punto.valor === 0) && {
                icono: Timer,
                titulo: 'Sin ventas en los últimos 7 días',
              }
            }
            alto={240}
          >
            <GraficoBarras
              serie={metricas.serieHoras}
              formatearValor={formatearPrecio}
              formatearEje={formatearPrecioCompacto}
              etiquetaSerie="Vendido"
            />
          </ContenidoPanel>
        </Panel>

        <Panel
          titulo="Productos más vendidos"
          descripcion="Por ingreso generado en los últimos 30 días"
          icono={UtensilsCrossed}
          enlace={{ texto: 'Productos', ruta: '/productos' }}
        >
          <ContenidoPanel
            cargando={ventasQuery.isLoading}
            error={errorVentas}
            vacio={
              metricas.ranking.length === 0 && {
                icono: UtensilsCrossed,
                titulo: 'Todavía no hay productos vendidos',
              }
            }
            alto={240}
          >
            <GraficoRanking
              items={metricas.ranking.map((producto) => ({
                nombre: producto.nombre,
                valor: producto.ingreso,
                detalle: `${formatearNumero(producto.cantidad)} und`,
              }))}
              formatearValor={formatearPrecio}
            />
          </ContenidoPanel>
        </Panel>
      </div>

      <div
        className="animar-entrada grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3"
        style={{ animationDelay: '180ms' }}
      >
        <Panel
          titulo="Ocupación del salón"
          descripcion="Mesas activas con pedido abierto"
          icono={Armchair}
          enlace={{ texto: 'Mesas', ruta: '/mesas' }}
        >
          <ContenidoPanel
            cargando={mesasQuery.isLoading || pedidosQuery.isLoading}
            error={
              mesasQuery.isError
                ? mensajeError(mesasQuery.error, 'No se pudieron cargar las mesas.')
                : undefined
            }
            vacio={
              operacion.mesasActivas.length === 0 && {
                icono: Armchair,
                titulo: 'No hay mesas activas',
                descripcion: 'Registra mesas para medir la ocupación del salón.',
              }
            }
            alto={180}
          >
            <div className="flex items-center gap-5">
              <AnilloProgreso
                proporcion={ocupacion}
                detalle={`${operacion.ocupadas} de ${operacion.mesasActivas.length}`}
              />
              <dl className="min-w-0 flex-1 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-xs text-zinc-500">Ocupadas</dt>
                  <dd className="text-sm font-semibold text-zinc-900 tabular-nums">
                    {operacion.ocupadas}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-xs text-zinc-500">Libres</dt>
                  <dd className="text-sm font-semibold text-zinc-900 tabular-nums">
                    {operacion.mesasActivas.length - operacion.ocupadas}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-xs text-zinc-500">Reservas de hoy</dt>
                  <dd className="text-sm font-semibold text-zinc-900 tabular-nums">
                    {operacion.reservasHoy}
                  </dd>
                </div>
              </dl>
            </div>
          </ContenidoPanel>
        </Panel>

        <Panel
          titulo="Cocina en curso"
          descripcion="Comandas que aún no se entregan"
          icono={Flame}
          enlace={{ texto: 'Cocina', ruta: '/cocina' }}
        >
          <ContenidoPanel
            cargando={comandasQuery.isLoading}
            error={
              comandasQuery.isError
                ? mensajeError(comandasQuery.error, 'No se pudieron cargar las comandas.')
                : undefined
            }
            vacio={
              operacion.enCurso.length === 0 && {
                icono: CookingPot,
                titulo: 'Cocina al día',
                descripcion: 'No hay comandas pendientes de entrega.',
              }
            }
            alto={180}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {ESTADOS_COCINA.map(({ estado, etiqueta, icono: Icono, clases }) => (
                  <div key={estado} className={`rounded-lg px-2.5 py-2 ${clases}`}>
                    <Icono className="h-3.5 w-3.5" strokeWidth={2} />
                    <p className="mt-1 text-lg font-bold tabular-nums">
                      {operacion.enCurso.filter((comanda) => comanda.estado === estado).length}
                    </p>
                    <p className="text-[11px] font-medium">{etiqueta}</p>
                  </div>
                ))}
              </div>
              <ul className="divide-y divide-zinc-100">
                {operacion.cola.map((comanda) => {
                  const minutos = minutosDesde(comanda.creadoEn, ahora);
                  return (
                    <li key={comanda.id} className="flex items-center gap-2 py-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-zinc-700">
                        {comanda.pedido.mesa ? `Mesa ${comanda.pedido.mesa.numero}` : 'Para llevar'}
                        <span className="text-zinc-400"> · {comanda.detalles.length} ítem(s)</span>
                      </span>
                      <span
                        className={`shrink-0 text-xs font-semibold tabular-nums ${
                          minutos >= 20 ? 'text-red-600' : 'text-zinc-500'
                        }`}
                      >
                        {minutos} min
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </ContenidoPanel>
        </Panel>

        <Panel
          titulo="Agenda de hoy"
          descripcion="Próximas reservas confirmadas y pendientes"
          icono={CalendarClock}
          enlace={{ texto: 'Reservas', ruta: '/reservas' }}
          className="lg:col-span-2 xl:col-span-1"
        >
          <ContenidoPanel
            cargando={reservasQuery.isLoading}
            error={
              reservasQuery.isError
                ? mensajeError(reservasQuery.error, 'No se pudieron cargar las reservas.')
                : undefined
            }
            vacio={
              operacion.agenda.length === 0 && {
                icono: CalendarClock,
                titulo: 'Sin reservas para hoy',
              }
            }
            alto={180}
          >
            <ul className="divide-y divide-zinc-100">
              {operacion.agenda.map((reserva) => (
                <li key={reserva.id} className="flex items-center gap-3 py-2.5">
                  <span className="w-12 shrink-0 text-sm font-semibold text-zinc-900 tabular-nums">
                    {formatearHora(reserva.fechaHora)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-zinc-700">
                      {nombreCliente(reserva.cliente)}
                    </span>
                    <span className="block truncate text-xs text-zinc-400">
                      Mesa {reserva.mesa.numero} · {reserva.cantidadPersonas} persona(s)
                    </span>
                  </span>
                  <Badge tono={reserva.estado === 'confirmada' ? 'exito' : 'neutral'}>
                    {reserva.estado === 'confirmada' ? 'Confirmada' : 'Pendiente'}
                  </Badge>
                </li>
              ))}
            </ul>
          </ContenidoPanel>
        </Panel>
      </div>

      {tienePermiso('ventas.ver') && (
        <section className="animar-entrada" style={{ animationDelay: '240ms' }}>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Últimas ventas emitidas</h2>
              <p className="mt-0.5 text-xs text-zinc-500">Los seis comprobantes más recientes.</p>
            </div>
            <Link
              to="/ventas"
              className="text-xs font-medium text-zinc-500 transition-colors hover:text-orange-600"
            >
              Ver todas
            </Link>
          </div>
          <Table
            columnas={[
              {
                encabezado: 'Comprobante',
                render: (venta) => (
                  <span className="font-medium text-zinc-900">
                    {venta.serie}-{String(venta.numero).padStart(6, '0')}
                    <span className="block text-xs font-normal text-zinc-400">
                      {venta.tipoComprobante.nombre}
                    </span>
                  </span>
                ),
              },
              { encabezado: 'Cliente', render: (venta) => nombreCliente(venta.cliente) },
              { encabezado: 'Mesa', render: (venta) => origenVenta(venta) },
              { encabezado: 'Medio de pago', render: (venta) => venta.medioPago?.nombre ?? '—' },
              { encabezado: 'Hora', render: (venta) => formatearHora(venta.creadoEn) },
              {
                encabezado: 'Total',
                render: (venta) => (
                  <span className="font-semibold text-zinc-900 tabular-nums">
                    {formatearPrecio(venta.total)}
                  </span>
                ),
              },
            ]}
            filas={metricas.ultimas}
            claveFila={(venta) => venta.id}
            cargando={ventasQuery.isLoading}
            error={errorVentas}
            onReintentar={() => void ventasQuery.refetch()}
            vacio="Sin ventas emitidas"
            vacioDescripcion="Aparecerán aquí en cuanto se emita el primer comprobante."
          />
        </section>
      )}

      {accesos.length > 0 && (
        <section className="animar-entrada" style={{ animationDelay: '300ms' }}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <LayoutGrid className="h-4 w-4 text-zinc-400" strokeWidth={2} />
            Accesos rápidos
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {accesos.map(({ etiqueta, ruta, icono: Icono, query }) => (
              <Link
                key={etiqueta}
                to={ruta}
                className="group flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3.5 py-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 transition-colors group-hover:bg-orange-50 group-hover:text-orange-600">
                  <Icono className="h-4 w-4" strokeWidth={2} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs text-zinc-500">{etiqueta}</span>
                  <span className="block text-base font-bold text-zinc-900 tabular-nums">
                    {query.isLoading ? (
                      <span className="inline-block h-4 w-6 animate-pulse rounded bg-zinc-100" />
                    ) : (
                      formatearNumero(query.data?.length ?? 0)
                    )}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!tienePermiso('ventas.ver') ? (
        <Alert
          tipo="advertencia"
          mensaje="Tu rol no tiene el permiso ventas.ver: los indicadores de venta no se muestran."
        />
      ) : (
        <p className="flex items-center gap-1.5 pt-1 text-xs text-zinc-400">
          <Info className="h-3.5 w-3.5" />
          Los indicadores excluyen los comprobantes anulados.
        </p>
      )}
    </div>
  );
}
