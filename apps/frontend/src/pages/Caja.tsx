import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  Eye,
  Lock,
  Plus,
  Unlock,
  Wallet,
} from 'lucide-react';
import * as cajaService from '../services/caja.service';
import * as ventasService from '../services/ventas.service';
import { useAuth } from '../context/AuthContext';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { FormActions } from '../components/ui/FormActions';
import { TarjetaOpcion } from '../components/ui/TarjetaOpcion';
import { EmptyState } from '../components/ui/EmptyState';
import { KpiCard } from '../components/ui/KpiCard';
import {
  formatearFechaHora,
  formatearHora,
  formatearPrecio,
  nombrePersonal,
} from '../utils/formato';
import { mensajeError } from '../utils/errores';
import type {
  AbrirCajaInput,
  CerrarCajaInput,
  RegistrarMovimientoInput,
} from '../services/caja.service';
import type { Caja as SesionCaja, EstadoCaja, TipoMovimientoCaja } from '../types/api';

/** Código del medio de pago "Efectivo" (ver catálogo de Ventas) — el único que mueve el
 * efectivo físico de la caja. Mismo criterio que usa el backend al cerrar (caja.service.ts),
 * recalculado aquí en vivo solo para la vista previa: el número que realmente queda guardado
 * lo calcula y congela el backend en el momento del cierre. */
const CODIGO_MEDIO_PAGO_EFECTIVO = 'efectivo';

const ETIQUETA_ESTADO: Record<EstadoCaja, string> = { abierta: 'Abierta', cerrada: 'Cerrada' };
const TONO_ESTADO: Record<EstadoCaja, 'exito' | 'neutral'> = {
  abierta: 'exito',
  cerrada: 'neutral',
};

const ETIQUETA_TIPO_MOVIMIENTO: Record<TipoMovimientoCaja, string> = {
  ingreso: 'Ingreso',
  egreso: 'Egreso',
};

function badgeDiferencia(diferencia: number | null) {
  if (diferencia === null) return <span className="text-zinc-400">—</span>;
  if (diferencia === 0) return <Badge tono="exito">Cuadrada</Badge>;
  const texto = `${diferencia > 0 ? '+' : ''}${formatearPrecio(diferencia)}`;
  return <Badge tono={diferencia > 0 ? 'neutral' : 'peligro'}>{texto}</Badge>;
}

function AbrirCajaModal({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const queryClient = useQueryClient();
  const form = useForm<AbrirCajaInput>({ defaultValues: { montoApertura: 0 } });

  const mutation = useMutation({
    mutationFn: cajaService.abrirCaja,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['caja-actual'] });
      queryClient.invalidateQueries({ queryKey: ['cajas'] });
      cerrar();
    },
  });

  function cerrar() {
    form.reset({ montoApertura: 0, observacion: '' });
    mutation.reset();
    onCerrar();
  }

  return (
    <Modal
      abierto={abierto}
      titulo="Abrir caja"
      descripcion="Registra el efectivo con el que arranca el turno."
      onCerrar={cerrar}
    >
      <form
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        className="flex flex-col gap-4"
        noValidate
      >
        {mutation.isError && (
          <Alert tipo="error" mensaje={mensajeError(mutation.error, 'No se pudo abrir la caja')} />
        )}
        <Input
          label="Monto de apertura"
          type="number"
          step="0.01"
          min="0"
          error={form.formState.errors.montoApertura?.message}
          {...form.register('montoApertura', {
            required: 'Indica el monto con el que abres la caja',
            valueAsNumber: true,
            min: { value: 0, message: 'No puede ser negativo' },
          })}
        />
        <Input
          label="Observación (opcional)"
          placeholder="Ej. billetes chicos para vueltos"
          {...form.register('observacion')}
        />
        <FormActions
          enviar="Abrir caja"
          enviandoTexto="Abriendo…"
          onCancelar={cerrar}
          enviando={form.formState.isSubmitting || mutation.isPending}
        />
      </form>
    </Modal>
  );
}

function RegistrarMovimientoModal({
  cajaId,
  abierto,
  onCerrar,
}: {
  cajaId: string;
  abierto: boolean;
  onCerrar: () => void;
}) {
  const queryClient = useQueryClient();
  const [tipo, setTipo] = useState<TipoMovimientoCaja>('ingreso');
  const form = useForm<Omit<RegistrarMovimientoInput, 'tipo'>>();

  const mutation = useMutation({
    mutationFn: (values: Omit<RegistrarMovimientoInput, 'tipo'>) =>
      cajaService.registrarMovimiento(cajaId, { ...values, tipo }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['caja-actual'] });
      cerrar();
    },
  });

  function cerrar() {
    form.reset({ monto: undefined, concepto: '' });
    setTipo('ingreso');
    mutation.reset();
    onCerrar();
  }

  return (
    <Modal
      abierto={abierto}
      titulo="Registrar movimiento"
      descripcion="Un ingreso o egreso manual de efectivo dentro de esta sesión."
      onCerrar={cerrar}
    >
      <form
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        className="flex flex-col gap-4"
        noValidate
      >
        {mutation.isError && (
          <Alert
            tipo="error"
            mensaje={mensajeError(mutation.error, 'No se pudo registrar el movimiento')}
          />
        )}
        <div className="flex gap-2">
          <TarjetaOpcion
            activo={tipo === 'ingreso'}
            icono={ArrowDownCircle}
            titulo="Ingreso"
            descripcion="Entra efectivo a la caja"
            onClick={() => setTipo('ingreso')}
          />
          <TarjetaOpcion
            activo={tipo === 'egreso'}
            icono={ArrowUpCircle}
            titulo="Egreso"
            descripcion="Sale efectivo de la caja"
            onClick={() => setTipo('egreso')}
          />
        </div>
        <Input
          label="Monto"
          type="number"
          step="0.01"
          min="0.01"
          error={form.formState.errors.monto?.message}
          {...form.register('monto', {
            required: 'Indica el monto',
            valueAsNumber: true,
            min: { value: 0.01, message: 'Debe ser mayor a 0' },
          })}
        />
        <Input
          label="Concepto"
          placeholder="Ej. compra de hielo, vuelto entregado de más…"
          error={form.formState.errors.concepto?.message}
          {...form.register('concepto', {
            required: 'Describe el motivo del movimiento',
            minLength: { value: 3, message: 'Muy corto' },
          })}
        />
        <FormActions
          enviar="Registrar"
          enviandoTexto="Registrando…"
          onCancelar={cerrar}
          enviando={form.formState.isSubmitting || mutation.isPending}
        />
      </form>
    </Modal>
  );
}

function CerrarCajaModal({
  caja,
  efectivoEsperado,
  abierto,
  onCerrar,
}: {
  caja: SesionCaja | null;
  efectivoEsperado: number;
  abierto: boolean;
  onCerrar: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<CerrarCajaInput>();
  const montoDeclarado = useWatch({ control: form.control, name: 'montoDeclarado' });
  const diferenciaPreview =
    typeof montoDeclarado === 'number' && !Number.isNaN(montoDeclarado)
      ? Math.round((montoDeclarado - efectivoEsperado) * 100) / 100
      : null;

  const mutation = useMutation({
    mutationFn: (values: CerrarCajaInput) => cajaService.cerrarCaja(caja!.id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['caja-actual'] });
      queryClient.invalidateQueries({ queryKey: ['cajas'] });
      cerrar();
    },
  });

  function cerrar() {
    form.reset({ montoDeclarado: undefined, observacion: '' });
    mutation.reset();
    onCerrar();
  }

  return (
    <Modal
      abierto={abierto}
      titulo="Cerrar caja"
      descripcion="Cuenta el efectivo físico y regístralo para el arqueo del turno."
      onCerrar={cerrar}
    >
      <form
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        className="flex flex-col gap-4"
        noValidate
      >
        {mutation.isError && (
          <Alert tipo="error" mensaje={mensajeError(mutation.error, 'No se pudo cerrar la caja')} />
        )}

        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
          <p className="text-zinc-500">Efectivo esperado en caja</p>
          <p className="text-xl font-bold text-zinc-900">{formatearPrecio(efectivoEsperado)}</p>
          <p className="mt-1 text-xs text-zinc-400">
            Apertura + ventas en efectivo del turno + ingresos − egresos manuales.
          </p>
        </div>

        <Input
          label="Monto contado físicamente"
          type="number"
          step="0.01"
          min="0"
          error={form.formState.errors.montoDeclarado?.message}
          {...form.register('montoDeclarado', {
            required: 'Indica cuánto efectivo contaste',
            valueAsNumber: true,
            min: { value: 0, message: 'No puede ser negativo' },
          })}
        />

        {diferenciaPreview !== null && (
          <div
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              diferenciaPreview === 0
                ? 'bg-emerald-50 text-emerald-700'
                : diferenciaPreview > 0
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-red-50 text-red-700'
            }`}
          >
            {diferenciaPreview === 0
              ? 'Caja cuadrada, sin diferencia.'
              : diferenciaPreview > 0
                ? `Sobrante de ${formatearPrecio(diferenciaPreview)}`
                : `Faltante de ${formatearPrecio(Math.abs(diferenciaPreview))}`}
          </div>
        )}

        <Input
          label="Observación (opcional)"
          placeholder="Ej. faltante por vuelto mal dado"
          {...form.register('observacion')}
        />

        <FormActions
          enviar="Cerrar caja"
          enviandoTexto="Cerrando…"
          onCancelar={cerrar}
          enviando={form.formState.isSubmitting || mutation.isPending}
          variante="danger"
        />
      </form>
    </Modal>
  );
}

function CajaDetalleModal({ caja, onCerrar }: { caja: SesionCaja | null; onCerrar: () => void }) {
  return (
    <Modal
      abierto={caja !== null}
      titulo={caja ? `Sesión de caja — ${formatearFechaHora(caja.creadoEn)}` : ''}
      onCerrar={onCerrar}
      tamano="lg"
    >
      {caja && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
            <div>
              <p className="text-zinc-500">Abierta por</p>
              <p className="font-medium text-zinc-900">
                {nombrePersonal(caja.usuarioApertura.personal)}
              </p>
              <p className="text-xs text-zinc-500">{formatearFechaHora(caja.creadoEn)}</p>
            </div>
            <div>
              <p className="text-zinc-500">Cerrada por</p>
              <p className="font-medium text-zinc-900">
                {caja.usuarioCierre ? nombrePersonal(caja.usuarioCierre.personal) : '—'}
              </p>
              {caja.fechaCierre && (
                <p className="text-xs text-zinc-500">{formatearFechaHora(caja.fechaCierre)}</p>
              )}
            </div>
            <div>
              <p className="text-zinc-500">Monto de apertura</p>
              <p className="font-medium text-zinc-900">{formatearPrecio(caja.montoApertura)}</p>
            </div>
            <div>
              <p className="text-zinc-500">Diferencia</p>
              <p className="font-medium text-zinc-900">{badgeDiferencia(caja.diferencia)}</p>
            </div>
            {caja.montoEsperado !== null && (
              <div>
                <p className="text-zinc-500">Esperado</p>
                <p className="font-medium text-zinc-900">{formatearPrecio(caja.montoEsperado)}</p>
              </div>
            )}
            {caja.montoDeclarado !== null && (
              <div>
                <p className="text-zinc-500">Declarado</p>
                <p className="font-medium text-zinc-900">{formatearPrecio(caja.montoDeclarado)}</p>
              </div>
            )}
            {caja.observacionApertura && (
              <div className="col-span-2">
                <p className="text-zinc-500">Observación de apertura</p>
                <p className="text-zinc-700">{caja.observacionApertura}</p>
              </div>
            )}
            {caja.observacionCierre && (
              <div className="col-span-2">
                <p className="text-zinc-500">Observación de cierre</p>
                <p className="text-zinc-700">{caja.observacionCierre}</p>
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-zinc-900">
              Movimientos ({caja.movimientos.length})
            </p>
            {caja.movimientos.length === 0 ? (
              <p className="text-sm text-zinc-400">Sin movimientos manuales en esta sesión.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-zinc-200">
                <ul className="divide-y divide-zinc-100">
                  {caja.movimientos.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                      {m.tipo === 'ingreso' ? (
                        <ArrowDownCircle className="h-4 w-4 shrink-0 text-emerald-600" />
                      ) : (
                        <ArrowUpCircle className="h-4 w-4 shrink-0 text-red-600" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-zinc-700">{m.concepto}</span>
                      <span
                        className={`shrink-0 font-semibold ${m.tipo === 'ingreso' ? 'text-emerald-700' : 'text-red-700'}`}
                      >
                        {m.tipo === 'ingreso' ? '+' : '−'}
                        {formatearPrecio(m.monto)}
                      </span>
                      <span className="shrink-0 text-xs text-zinc-400">
                        {formatearHora(m.creadoEn)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

export function Caja() {
  const { tienePermiso } = useAuth();
  const [modalAbrir, setModalAbrir] = useState(false);
  const [modalCerrar, setModalCerrar] = useState(false);
  const [modalMovimiento, setModalMovimiento] = useState(false);
  const [cajaViendo, setCajaViendo] = useState<SesionCaja | null>(null);

  const cajaActualQuery = useQuery({
    queryKey: ['caja-actual'],
    queryFn: cajaService.obtenerCajaActual,
  });
  const historialQuery = useQuery({ queryKey: ['cajas'], queryFn: cajaService.listarCajas });
  // Mismo queryKey que usa Ventas.tsx: comparten caché, no se duplica la llamada. Se necesita
  // aquí solo para estimar en vivo el efectivo esperado mientras la caja sigue abierta — el
  // número que realmente queda guardado lo calcula y congela el backend recién al cerrar.
  const ventasQuery = useQuery({
    queryKey: ['ventas'],
    queryFn: () => ventasService.listarVentas(),
  });

  const cajaActual = cajaActualQuery.data ?? null;

  const efectivoVentasTurno = cajaActual
    ? (ventasQuery.data ?? [])
        .filter(
          (v) =>
            v.estado === 'emitida' &&
            v.medioPago?.codigo === CODIGO_MEDIO_PAGO_EFECTIVO &&
            new Date(v.creadoEn) >= new Date(cajaActual.creadoEn),
        )
        .reduce((suma, v) => suma + v.total, 0)
    : 0;
  const ingresosManuales =
    cajaActual?.movimientos
      .filter((m) => m.tipo === 'ingreso')
      .reduce((suma, m) => suma + m.monto, 0) ?? 0;
  const egresosManuales =
    cajaActual?.movimientos
      .filter((m) => m.tipo === 'egreso')
      .reduce((suma, m) => suma + m.monto, 0) ?? 0;
  const efectivoEsperadoAhora = cajaActual
    ? Math.round(
        (cajaActual.montoApertura + efectivoVentasTurno + ingresosManuales - egresosManuales) * 100,
      ) / 100
    : 0;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Caja</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Apertura, cierre y movimientos de efectivo del turno
          </p>
        </div>
        {cajaActual
          ? tienePermiso('caja.cerrar') && (
              <Button
                variante="danger"
                icono={<Lock className="h-4 w-4" />}
                onClick={() => setModalCerrar(true)}
              >
                Cerrar caja
              </Button>
            )
          : tienePermiso('caja.abrir') && (
              <Button icono={<Unlock className="h-4 w-4" />} onClick={() => setModalAbrir(true)}>
                Abrir caja
              </Button>
            )}
      </div>

      {cajaActualQuery.isLoading ? (
        <div className="h-40 animate-pulse rounded-xl border border-zinc-200 bg-white" />
      ) : !cajaActual ? (
        <div className="animar-entrada rounded-xl border border-dashed border-zinc-300 bg-white shadow-sm">
          <EmptyState
            icono={Wallet}
            titulo="No hay una caja abierta"
            descripcion="Abre una sesión para empezar a registrar el efectivo del turno."
          >
            {tienePermiso('caja.abrir') && (
              <Button
                className="mt-2"
                icono={<Unlock className="h-4 w-4" />}
                onClick={() => setModalAbrir(true)}
              >
                Abrir caja
              </Button>
            )}
          </EmptyState>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="animar-entrada relative overflow-hidden rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-600 to-emerald-700 p-5 text-white shadow-sm">
            <Wallet
              aria-hidden="true"
              strokeWidth={0.6}
              className="pointer-events-none absolute -top-6 -right-6 h-40 w-40 text-white/10"
            />
            <div className="relative flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
                </span>
                <span className="text-sm font-semibold tracking-wide uppercase">Caja abierta</span>
              </div>
              <p className="text-sm text-emerald-50">
                Abierta por{' '}
                <span className="font-semibold text-white">
                  {nombrePersonal(cajaActual.usuarioApertura.personal)}
                </span>{' '}
                el {formatearFechaHora(cajaActual.creadoEn)}
              </p>
            </div>
            <div className="relative mt-4">
              <p className="text-xs text-emerald-100 uppercase">Efectivo esperado ahora</p>
              <p className="text-3xl font-bold">{formatearPrecio(efectivoEsperadoAhora)}</p>
            </div>
          </div>

          <div
            className="animar-entrada grid grid-cols-2 gap-4 sm:grid-cols-4"
            style={{ animationDelay: '80ms' }}
          >
            <KpiCard
              etiqueta="Monto de apertura"
              valor={cajaActual.montoApertura}
              formatear={formatearPrecio}
              icono={Wallet}
              tono="naranja"
            />
            <KpiCard
              etiqueta="Ventas en efectivo"
              valor={efectivoVentasTurno}
              formatear={formatearPrecio}
              icono={Banknote}
              tono="azul"
              detalle="Del turno actual"
            />
            <KpiCard
              etiqueta="Ingresos manuales"
              valor={ingresosManuales}
              formatear={formatearPrecio}
              icono={ArrowDownCircle}
              tono="esmeralda"
            />
            <KpiCard
              etiqueta="Egresos manuales"
              valor={egresosManuales}
              formatear={formatearPrecio}
              icono={ArrowUpCircle}
              tono="ambar"
            />
          </div>

          <div className="animar-entrada" style={{ animationDelay: '140ms' }}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900">Movimientos de esta sesión</h2>
              {tienePermiso('caja.abrir') && (
                <Button
                  variante="secondary"
                  icono={<Plus className="h-4 w-4" />}
                  onClick={() => setModalMovimiento(true)}
                >
                  Registrar movimiento
                </Button>
              )}
            </div>
            <Table
              columnas={[
                {
                  encabezado: 'Tipo',
                  render: (m) => (
                    <span
                      className={`inline-flex items-center gap-1.5 font-medium ${
                        m.tipo === 'ingreso' ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {m.tipo === 'ingreso' ? (
                        <ArrowDownCircle className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowUpCircle className="h-3.5 w-3.5" />
                      )}
                      {ETIQUETA_TIPO_MOVIMIENTO[m.tipo]}
                    </span>
                  ),
                },
                { encabezado: 'Concepto', render: (m) => m.concepto },
                {
                  encabezado: 'Monto',
                  render: (m) => (
                    <span className={m.tipo === 'ingreso' ? 'text-emerald-700' : 'text-red-700'}>
                      {m.tipo === 'ingreso' ? '+' : '−'}
                      {formatearPrecio(m.monto)}
                    </span>
                  ),
                },
                { encabezado: 'Registrado por', render: (m) => nombrePersonal(m.usuario.personal) },
                { encabezado: 'Hora', render: (m) => formatearHora(m.creadoEn) },
              ]}
              filas={[...cajaActual.movimientos].reverse()}
              claveFila={(m) => m.id}
              vacio="Aún no hay movimientos manuales en esta sesión"
            />
          </div>
        </div>
      )}

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Historial de sesiones</h2>
        <Table
          columnas={[
            {
              encabezado: 'Apertura',
              render: (c) => formatearFechaHora(c.creadoEn),
            },
            {
              encabezado: 'Cierre',
              render: (c) => (c.fechaCierre ? formatearFechaHora(c.fechaCierre) : '—'),
            },
            {
              encabezado: 'Abierta por',
              render: (c) => nombrePersonal(c.usuarioApertura.personal),
            },
            { encabezado: 'Apertura (S/)', render: (c) => formatearPrecio(c.montoApertura) },
            {
              encabezado: 'Esperado (S/)',
              render: (c) => (c.montoEsperado !== null ? formatearPrecio(c.montoEsperado) : '—'),
            },
            {
              encabezado: 'Declarado (S/)',
              render: (c) => (c.montoDeclarado !== null ? formatearPrecio(c.montoDeclarado) : '—'),
            },
            { encabezado: 'Diferencia', render: (c) => badgeDiferencia(c.diferencia) },
            {
              encabezado: 'Estado',
              render: (c) => (
                <Badge tono={TONO_ESTADO[c.estado]}>{ETIQUETA_ESTADO[c.estado]}</Badge>
              ),
            },
            {
              encabezado: '',
              render: (c) => (
                <button
                  type="button"
                  onClick={() => setCajaViendo(c)}
                  className="flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-700"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Ver
                </button>
              ),
            },
          ]}
          filas={historialQuery.data ?? []}
          claveFila={(c) => c.id}
          vacio="Aún no hay sesiones de caja registradas"
          cargando={historialQuery.isLoading}
          error={
            historialQuery.isError
              ? mensajeError(historialQuery.error, 'No se pudo cargar el historial de caja')
              : undefined
          }
          onReintentar={() => void historialQuery.refetch()}
        />
      </div>

      <AbrirCajaModal abierto={modalAbrir} onCerrar={() => setModalAbrir(false)} />
      {cajaActual && (
        <>
          <RegistrarMovimientoModal
            cajaId={cajaActual.id}
            abierto={modalMovimiento}
            onCerrar={() => setModalMovimiento(false)}
          />
          <CerrarCajaModal
            caja={cajaActual}
            efectivoEsperado={efectivoEsperadoAhora}
            abierto={modalCerrar}
            onCerrar={() => setModalCerrar(false)}
          />
        </>
      )}
      <CajaDetalleModal caja={cajaViendo} onCerrar={() => setCajaViendo(null)} />
    </div>
  );
}
