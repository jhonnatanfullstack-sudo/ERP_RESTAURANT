import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Building2,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Pause,
  Play,
  ShieldOff,
  Timer,
  XCircle,
} from 'lucide-react';
import * as plataformaService from '../services/plataforma.service';
import { KpiCard } from '../components/ui/KpiCard';
import { Table } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { EmptyState } from '../components/ui/EmptyState';
import { formatearFechaHora, formatearNumero } from '../utils/formato';
import { mensajeError } from '../utils/errores';
import type {
  AccionEmpresa,
  CicloFacturacion,
  EmpresaEnPanel,
  EstadoSuscripcion,
  PlanContratado,
} from '../types/api';

const ETIQUETA_PLAN: Record<PlanContratado, string> = {
  operativo: 'Operativo',
  facturacion: 'Facturación electrónica',
  completo: 'Completo',
};

const ETIQUETA_CICLO: Record<CicloFacturacion, string> = {
  mensual: 'Mensual',
  trimestral: 'Trimestral',
  anual: 'Anual',
};

function formatearMonto(valor: number): string {
  return `S/ ${Number(valor).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Solicitudes de contratación/renovación pendientes de confirmar (FASE 29). Sin pasarela de
 * pago conectada, este es el punto donde el proveedor confirma a mano que el dinero llegó
 * (Yape/transferencia) y con eso activa la cuenta por los meses pagados — ver
 * `decisiones-tecnicas.md`. */
function SolicitudesSuscripcion() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const solicitudesQuery = useQuery({
    queryKey: ['plataforma-solicitudes'],
    queryFn: plataformaService.listarSolicitudesPendientes,
  });

  function alExito() {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ['plataforma-solicitudes'] });
    void queryClient.invalidateQueries({ queryKey: ['plataforma-panel'] });
  }

  const confirmarMutation = useMutation({
    mutationFn: plataformaService.confirmarSolicitud,
    onSuccess: alExito,
    onError: (excepcion) => setError(mensajeError(excepcion, 'No se pudo confirmar el pago')),
  });
  const rechazarMutation = useMutation({
    mutationFn: plataformaService.rechazarSolicitud,
    onSuccess: alExito,
    onError: (excepcion) => setError(mensajeError(excepcion, 'No se pudo rechazar la solicitud')),
  });

  const solicitudes = solicitudesQuery.data ?? [];
  if (!solicitudesQuery.isLoading && solicitudes.length === 0) return null;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <CreditCard className="h-4.5 w-4.5 text-orange-600" />
        <h2 className="text-base font-bold text-zinc-900">Solicitudes de suscripción</h2>
        {solicitudes.length > 0 && <Badge tono="neutral">{solicitudes.length} pendientes</Badge>}
      </div>

      {error && (
        <div className="mb-3">
          <Alert tipo="error" mensaje={error} />
        </div>
      )}

      {solicitudesQuery.isLoading ? (
        <p className="text-sm text-zinc-500">Cargando…</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {solicitudes.map((s) => (
            <li
              key={s.id}
              className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium text-zinc-900">
                  {s.empresa.nombreComercial ?? s.empresa.razonSocial}
                  <span className="ml-2 text-xs font-normal text-zinc-400">{s.empresa.ruc}</span>
                </p>
                <p className="text-sm text-zinc-600">
                  Plan {ETIQUETA_PLAN[s.plan]} · {ETIQUETA_CICLO[s.ciclo]} ·{' '}
                  <span className="font-semibold text-zinc-900">{formatearMonto(s.monto)}</span>
                </p>
                {s.mensajeContacto && (
                  <p className="mt-1 text-xs text-zinc-500">"{s.mensajeContacto}"</p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variante="secondary"
                  className="px-2.5 py-1.5 text-xs"
                  icono={<CheckCircle2 className="h-3.5 w-3.5" />}
                  cargando={confirmarMutation.isPending}
                  onClick={() => confirmarMutation.mutate(s.id)}
                >
                  Confirmar pago
                </Button>
                <Button
                  variante="ghost"
                  className="px-2.5 py-1.5 text-xs text-red-600"
                  icono={<XCircle className="h-3.5 w-3.5" />}
                  cargando={rechazarMutation.isPending}
                  onClick={() => rechazarMutation.mutate(s.id)}
                >
                  Rechazar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const DIAS_EXTENSION = 15;

const ETIQUETA_ESTADO: Record<
  EstadoSuscripcion,
  { texto: string; tono: 'exito' | 'neutral' | 'peligro' }
> = {
  activa: { texto: 'Cliente activo', tono: 'exito' },
  demo: { texto: 'En prueba', tono: 'neutral' },
  demo_vencida: { texto: 'Prueba vencida', tono: 'peligro' },
  suscripcion_vencida: { texto: 'Suscripción vencida', tono: 'peligro' },
  suspendida: { texto: 'Suspendida', tono: 'peligro' },
};

function DetalleUso({ empresa }: { empresa: EmpresaEnPanel }) {
  const usoQuery = useQuery({
    queryKey: ['plataforma-uso', empresa.id],
    queryFn: () => plataformaService.obtenerUsoDiario(empresa.id),
  });

  const maximo = Math.max(...(usoQuery.data ?? []).map((dia) => dia.peticiones), 1);

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { etiqueta: 'RUC', valor: empresa.ruc },
          { etiqueta: 'Peticiones', valor: formatearNumero(empresa.peticiones) },
          { etiqueta: 'Escrituras', valor: formatearNumero(empresa.escrituras) },
          { etiqueta: 'Días con actividad', valor: formatearNumero(empresa.diasConActividad) },
        ].map((dato) => (
          <div key={dato.etiqueta} className="rounded-lg border border-zinc-200 px-3 py-2.5">
            <dt className="text-xs text-zinc-500">{dato.etiqueta}</dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-900">
              {dato.valor}
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-600">
        <a
          href={`/carta/${empresa.slug}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 font-medium text-orange-600 hover:text-orange-700"
        >
          Ver su carta pública
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        {empresa.email && <span>{empresa.email}</span>}
        {empresa.telefono && <span>{empresa.telefono}</span>}
      </div>

      <div>
        <p className="mb-3 text-sm font-semibold text-zinc-900">Uso de los últimos 90 días</p>
        {usoQuery.isLoading ? (
          <div className="h-24 animate-pulse rounded-lg bg-zinc-100" />
        ) : (usoQuery.data ?? []).length === 0 ? (
          <p className="text-sm text-zinc-500">
            Todavía no registró actividad: creó la cuenta pero no llegó a usar el sistema.
          </p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {(usoQuery.data ?? []).slice(0, 14).map((dia) => (
              <li key={dia.fecha} className="flex items-center gap-3 text-xs">
                <span className="w-20 shrink-0 tabular-nums text-zinc-500">{dia.fecha}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
                  <span
                    className="block h-full rounded-full bg-orange-500"
                    style={{ width: `${(dia.peticiones / maximo) * 100}%` }}
                  />
                </span>
                <span className="w-28 shrink-0 text-right tabular-nums text-zinc-600">
                  {formatearNumero(dia.peticiones)} · {formatearNumero(dia.escrituras)} esc.
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

/**
 * Panel del proveedor del sistema: todas las empresas, su estado comercial y su uso real.
 *
 * Es la única pantalla que atraviesa el aislamiento entre empresas, y por eso no se muestra
 * en el menú a nadie más: el backend responde 404 a quien no está marcado como proveedor, y
 * la página trata ese 404 como "no disponible" en vez de como un error.
 */
export function Plataforma() {
  const queryClient = useQueryClient();
  const [detalle, setDetalle] = useState<EmpresaEnPanel | null>(null);
  const [error, setError] = useState<string | null>(null);

  const panelQuery = useQuery({
    queryKey: ['plataforma-panel'],
    queryFn: plataformaService.obtenerPanel,
    retry: false,
  });

  const accionMutation = useMutation({
    mutationFn: ({ empresaId, accion }: { empresaId: string; accion: AccionEmpresa }) =>
      plataformaService.aplicarAccion(empresaId, accion),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['plataforma-panel'] });
    },
    onError: (excepcion) =>
      setError(mensajeError(excepcion, 'No se pudo actualizar el estado de la empresa')),
  });

  function ejecutar(empresaId: string, accion: AccionEmpresa) {
    accionMutation.mutate({ empresaId, accion });
  }

  if (panelQuery.isError) {
    return (
      <EmptyState
        icono={ShieldOff}
        titulo="Panel no disponible"
        descripcion="Esta sección es exclusiva del proveedor del sistema."
      />
    );
  }

  const datos = panelQuery.data;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-zinc-900">Panel del proveedor</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Empresas registradas en el sistema, estado de su prueba y cuánto lo están usando.
        </p>
      </header>

      {error && <Alert tipo="error" mensaje={error} />}

      <SolicitudesSuscripcion />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          etiqueta="Empresas"
          valor={datos?.totalEmpresas ?? 0}
          formatear={formatearNumero}
          icono={Building2}
          tono="azul"
          detalle={`${datos?.clientesActivos ?? 0} contratadas`}
          cargando={panelQuery.isLoading}
        />
        <KpiCard
          etiqueta="Pruebas en curso"
          valor={datos?.demosActivas ?? 0}
          formatear={formatearNumero}
          icono={Timer}
          tono="ambar"
          detalle={`${datos?.demosVencidas ?? 0} ya vencidas`}
          cargando={panelQuery.isLoading}
        />
        <KpiCard
          etiqueta="Activas esta semana"
          valor={datos?.activasUltimos7Dias ?? 0}
          formatear={formatearNumero}
          icono={Activity}
          tono="esmeralda"
          detalle="Con al menos una escritura"
          cargando={panelQuery.isLoading}
        />
        <KpiCard
          etiqueta="Suspendidas"
          valor={datos?.suspendidas ?? 0}
          formatear={formatearNumero}
          icono={Pause}
          tono="violeta"
          cargando={panelQuery.isLoading}
        />
      </div>

      <Table
        columnas={[
          {
            encabezado: 'Empresa',
            render: (e: EmpresaEnPanel) => (
              <div>
                <button
                  type="button"
                  onClick={() => setDetalle(e)}
                  className="font-medium text-zinc-900 transition-colors hover:text-orange-600"
                >
                  {e.nombreComercial ?? e.razonSocial}
                </button>
                <p className="text-xs text-zinc-500">
                  {e.ruc}
                  {e.creadaPorAutoservicio ? ' · alta por autoservicio' : ''}
                </p>
              </div>
            ),
          },
          {
            encabezado: 'Estado',
            render: (e: EmpresaEnPanel) => (
              <div className="flex flex-col items-start gap-1">
                <Badge tono={ETIQUETA_ESTADO[e.estado].tono}>
                  {ETIQUETA_ESTADO[e.estado].texto}
                </Badge>
                {e.diasRestantes !== null && (
                  <span className="text-xs text-zinc-500">
                    {e.diasRestantes === 0 ? 'Sin días' : `Quedan ${e.diasRestantes} días`}
                  </span>
                )}
              </div>
            ),
          },
          {
            encabezado: 'Uso',
            render: (e: EmpresaEnPanel) => (
              <div className="text-sm whitespace-nowrap text-zinc-600 tabular-nums">
                <p>{formatearNumero(e.peticiones)} peticiones</p>
                <p className="text-xs text-zinc-400">
                  {formatearNumero(e.escrituras)} escrituras ·{' '}
                  {e.diasConActividad === 1 ? '1 día' : `${e.diasConActividad} días`}
                </p>
              </div>
            ),
          },
          {
            encabezado: 'Último acceso',
            render: (e: EmpresaEnPanel) => (
              <span className="text-sm text-zinc-600">
                <span className="whitespace-nowrap">
                  {e.ultimoAcceso ? formatearFechaHora(e.ultimoAcceso) : 'Nunca'}
                </span>
              </span>
            ),
          },
          {
            encabezado: 'Acciones',
            render: (e: EmpresaEnPanel) => (
              <div className="flex flex-wrap gap-1.5">
                {e.plan !== 'activo' && (
                  <Button
                    variante="ghost"
                    className="px-2 py-1 text-xs"
                    icono={<CheckCircle2 className="h-3.5 w-3.5" />}
                    onClick={() => ejecutar(e.id, { tipo: 'activar' })}
                  >
                    Activar
                  </Button>
                )}
                {e.estado !== 'activa' && (
                  <Button
                    variante="ghost"
                    className="px-2 py-1 text-xs"
                    icono={<CalendarClock className="h-3.5 w-3.5" />}
                    onClick={() => ejecutar(e.id, { tipo: 'extender_demo', dias: DIAS_EXTENSION })}
                  >
                    +{DIAS_EXTENSION} días
                  </Button>
                )}
                {e.estado === 'suspendida' ? (
                  <Button
                    variante="ghost"
                    className="px-2 py-1 text-xs"
                    icono={<Play className="h-3.5 w-3.5" />}
                    onClick={() => ejecutar(e.id, { tipo: 'reactivar' })}
                  >
                    Reactivar
                  </Button>
                ) : (
                  <Button
                    variante="ghost"
                    className="px-2 py-1 text-xs text-red-600"
                    icono={<Pause className="h-3.5 w-3.5" />}
                    onClick={() => ejecutar(e.id, { tipo: 'suspender' })}
                  >
                    Suspender
                  </Button>
                )}
              </div>
            ),
          },
        ]}
        filas={datos?.empresas ?? []}
        claveFila={(e) => e.id}
        cargando={panelQuery.isLoading}
        vacio="Todavía no hay empresas registradas"
        vacioDescripcion="Comparte el enlace de registro para que empiecen a crear sus pruebas."
      />

      <Modal
        abierto={detalle !== null}
        titulo={detalle?.nombreComercial ?? detalle?.razonSocial ?? ''}
        descripcion="Uso real de la cuenta"
        onCerrar={() => setDetalle(null)}
        tamano="xl"
      >
        {detalle && <DetalleUso empresa={detalle} />}
      </Modal>
    </div>
  );
}
