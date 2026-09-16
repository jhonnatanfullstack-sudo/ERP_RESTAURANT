import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Clock, LogIn, LogOut, Users } from 'lucide-react';
import * as turnosService from '../services/turnos.service';
import { useAuth } from '../context/AuthContext';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { FormActions } from '../components/ui/FormActions';
import { EmptyState } from '../components/ui/EmptyState';
import { formatearFechaHora, formatearHora, nombrePersonal } from '../utils/formato';
import { mensajeError } from '../utils/errores';
import type { AbrirTurnoInput, CerrarTurnoInput } from '../services/turnos.service';
import type { EstadoTurno, Turno } from '../types/api';

const ETIQUETA_ESTADO: Record<EstadoTurno, string> = { abierto: 'Abierto', cerrado: 'Cerrado' };
const TONO_ESTADO: Record<EstadoTurno, 'exito' | 'neutral'> = {
  abierto: 'exito',
  cerrado: 'neutral',
};

function invalidarTurnos(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['mi-turno'] });
  queryClient.invalidateQueries({ queryKey: ['turnos'] });
}

function AbrirTurnoModal({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const queryClient = useQueryClient();
  const form = useForm<AbrirTurnoInput>();

  const mutation = useMutation({
    mutationFn: turnosService.abrirTurno,
    onSuccess: () => {
      invalidarTurnos(queryClient);
      cerrar();
    },
  });

  function cerrar() {
    form.reset({ nota: '' });
    mutation.reset();
    onCerrar();
  }

  return (
    <Modal
      abierto={abierto}
      titulo="Iniciar turno"
      descripcion="Registra el inicio de tu jornada."
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
            mensaje={mensajeError(mutation.error, 'No se pudo iniciar el turno')}
          />
        )}
        <Input
          label="Nota (opcional)"
          placeholder="Ej. cubro el turno de la mañana"
          {...form.register('nota')}
        />
        <FormActions
          enviar="Iniciar turno"
          enviandoTexto="Iniciando…"
          onCancelar={cerrar}
          enviando={form.formState.isSubmitting || mutation.isPending}
        />
      </form>
    </Modal>
  );
}

function CerrarTurnoModal({
  turno,
  onCerrar,
}: {
  turno: Turno | null;
  onCerrar: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<CerrarTurnoInput>();

  const mutation = useMutation({
    mutationFn: (values: CerrarTurnoInput) => turnosService.cerrarTurno(turno!.id, values),
    onSuccess: () => {
      invalidarTurnos(queryClient);
      cerrar();
    },
  });

  function cerrar() {
    form.reset({ nota: '' });
    mutation.reset();
    onCerrar();
  }

  return (
    <Modal
      abierto={turno !== null}
      titulo="Terminar turno"
      descripcion="Registra el fin de la jornada."
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
            mensaje={mensajeError(mutation.error, 'No se pudo terminar el turno')}
          />
        )}
        <Input
          label="Nota (opcional)"
          placeholder="Ej. queda pendiente el pedido de la mesa 4"
          {...form.register('nota')}
        />
        <FormActions
          enviar="Terminar turno"
          enviandoTexto="Cerrando…"
          onCancelar={cerrar}
          enviando={form.formState.isSubmitting || mutation.isPending}
          variante="danger"
        />
      </form>
    </Modal>
  );
}

export function Turnos() {
  const { tienePermiso } = useAuth();
  const [modalAbrir, setModalAbrir] = useState(false);
  const [turnoCerrando, setTurnoCerrando] = useState<Turno | null>(null);

  const miTurnoQuery = useQuery({ queryKey: ['mi-turno'], queryFn: turnosService.obtenerMiTurno });
  const historialQuery = useQuery({ queryKey: ['turnos'], queryFn: turnosService.listarTurnos });

  const miTurno = miTurnoQuery.data ?? null;
  const turnos = historialQuery.data ?? [];
  const turnosAbiertos = turnos.filter((t) => t.estado === 'abierto');

  const columnasAbiertos: Array<{ encabezado: string; render: (t: Turno) => React.ReactNode }> = [
    { encabezado: 'Persona', render: (t) => nombrePersonal(t.usuario.personal) },
    { encabezado: 'Desde', render: (t) => formatearHora(t.creadoEn) },
    { encabezado: 'Nota', render: (t) => t.notaApertura ?? '—' },
  ];
  if (tienePermiso('turnos.cerrar')) {
    columnasAbiertos.push({
      encabezado: '',
      render: (t) => (
        <button
          type="button"
          onClick={() => setTurnoCerrando(t)}
          className="flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-700"
        >
          <LogOut className="h-3.5 w-3.5" />
          Terminar
        </button>
      ),
    });
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Turnos de personal</h1>
          <p className="mt-1 text-sm text-zinc-500">Inicio y fin de jornada del equipo</p>
        </div>
      </div>

      {miTurnoQuery.isLoading ? (
        <div className="h-32 animate-pulse rounded-xl border border-zinc-200 bg-white" />
      ) : miTurno ? (
        <div className="animar-entrada relative overflow-hidden rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-600 to-emerald-700 p-5 text-white shadow-sm">
          <Clock
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
              <span className="text-sm font-semibold tracking-wide uppercase">
                Turno en curso
              </span>
            </div>
            <p className="text-sm text-emerald-50">
              Iniciado el {formatearFechaHora(miTurno.creadoEn)}
            </p>
          </div>
          {tienePermiso('turnos.cerrar') && (
            <div className="relative mt-4">
              <Button
                variante="secondary"
                icono={<LogOut className="h-4 w-4" />}
                onClick={() => setTurnoCerrando(miTurno)}
              >
                Terminar turno
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="animar-entrada rounded-xl border border-dashed border-zinc-300 bg-white shadow-sm">
          <EmptyState
            icono={Clock}
            titulo="No tienes un turno abierto"
            descripcion="Inícialo para registrar tu jornada de hoy."
          >
            {tienePermiso('turnos.abrir') && (
              <Button
                className="mt-2"
                icono={<LogIn className="h-4 w-4" />}
                onClick={() => setModalAbrir(true)}
              >
                Iniciar turno
              </Button>
            )}
          </EmptyState>
        </div>
      )}

      <div className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <Users className="h-4 w-4 text-zinc-400" />
          Trabajando ahora ({turnosAbiertos.length})
        </h2>
        <Table
          columnas={columnasAbiertos}
          filas={turnosAbiertos}
          claveFila={(t) => t.id}
          vacio="Nadie tiene un turno abierto en este momento"
          cargando={historialQuery.isLoading}
        />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Historial</h2>
        <Table
          columnas={[
            { encabezado: 'Persona', render: (t) => nombrePersonal(t.usuario.personal) },
            { encabezado: 'Inicio', render: (t) => formatearFechaHora(t.creadoEn) },
            {
              encabezado: 'Fin',
              render: (t) => (t.fechaCierre ? formatearFechaHora(t.fechaCierre) : '—'),
            },
            {
              encabezado: 'Cerrado por',
              render: (t) => (t.usuarioCierre ? nombrePersonal(t.usuarioCierre.personal) : '—'),
            },
            {
              encabezado: 'Estado',
              render: (t) => <Badge tono={TONO_ESTADO[t.estado]}>{ETIQUETA_ESTADO[t.estado]}</Badge>,
            },
          ]}
          filas={turnos}
          claveFila={(t) => t.id}
          vacio="Aún no hay turnos registrados"
          cargando={historialQuery.isLoading}
          error={
            historialQuery.isError
              ? mensajeError(historialQuery.error, 'No se pudo cargar el historial de turnos')
              : undefined
          }
          onReintentar={() => void historialQuery.refetch()}
        />
      </div>

      <AbrirTurnoModal abierto={modalAbrir} onCerrar={() => setModalAbrir(false)} />
      <CerrarTurnoModal turno={turnoCerrando} onCerrar={() => setTurnoCerrando(null)} />
    </div>
  );
}
