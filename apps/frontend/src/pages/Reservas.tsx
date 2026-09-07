import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { CalendarCheck, CalendarX2, Check, Pencil } from 'lucide-react';
import * as reservasService from '../services/reservas.service';
import * as clientesService from '../services/clientes.service';
import * as mesasService from '../services/mesas.service';
import { useAuth } from '../context/AuthContext';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { aInputDatetimeLocal, formatearFechaHora } from '../utils/formato';
import type { ActualizarReservaInput, CrearReservaInput } from '../services/reservas.service';
import type { EstadoReserva, Reserva } from '../types/api';

const inputClass =
  'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none';
const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-700';

const ETIQUETA_ESTADO: Record<EstadoReserva, string> = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
  completada: 'Completada',
};

const TONO_ESTADO: Record<EstadoReserva, 'exito' | 'neutral' | 'peligro'> = {
  pendiente: 'neutral',
  confirmada: 'exito',
  completada: 'exito',
  cancelada: 'peligro',
};

function mensajeError(error: unknown, fallback: string): string {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
  );
}

export function Reservas() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [reservaEditando, setReservaEditando] = useState<Reserva | null>(null);
  const [reservaCancelando, setReservaCancelando] = useState<Reserva | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<'todas' | EstadoReserva>('todas');

  const reservasQuery = useQuery({
    queryKey: ['reservas'],
    queryFn: reservasService.listarReservas,
  });
  const clientesQuery = useQuery({
    queryKey: ['clientes'],
    queryFn: clientesService.listarClientes,
  });
  const mesasQuery = useQuery({ queryKey: ['mesas'], queryFn: mesasService.listarMesas });

  const crearForm = useForm<CrearReservaInput>();
  const editarForm = useForm<ActualizarReservaInput>();

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['reservas'] });
  }

  const crearMutation = useMutation({
    mutationFn: (values: CrearReservaInput) =>
      reservasService.crearReserva({
        ...values,
        fechaHora: new Date(values.fechaHora).toISOString(),
        duracionMinutos: Number.isNaN(values.duracionMinutos) ? undefined : values.duracionMinutos,
      }),
    onSuccess: () => {
      invalidar();
      setModalAbierto(false);
      crearForm.reset();
    },
  });

  const editarMutation = useMutation({
    mutationFn: (values: ActualizarReservaInput) =>
      reservasService.actualizarReserva(reservaEditando!.id, {
        ...values,
        fechaHora: values.fechaHora ? new Date(values.fechaHora).toISOString() : undefined,
        duracionMinutos: Number.isNaN(values.duracionMinutos) ? undefined : values.duracionMinutos,
      }),
    onSuccess: () => {
      invalidar();
      setReservaEditando(null);
    },
  });

  const cambiarEstadoMutation = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: EstadoReserva }) =>
      reservasService.actualizarReserva(id, { estado }),
    onSuccess: invalidar,
  });

  const cancelarMutation = useMutation({
    mutationFn: () => reservasService.cancelarReserva(reservaCancelando!.id),
    onSuccess: () => {
      invalidar();
      setReservaCancelando(null);
    },
  });

  if (reservasQuery.isLoading) return <Spinner />;

  const reservas = reservasQuery.data ?? [];
  const reservasFiltradas =
    filtroEstado === 'todas' ? reservas : reservas.filter((r) => r.estado === filtroEstado);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Reservas</h1>
          <p className="mt-1 text-sm text-zinc-500">Reservas de mesa de los clientes</p>
        </div>
        {tienePermiso('reservas.crear') && (
          <Button
            icono={<CalendarCheck className="h-4 w-4" />}
            onClick={() => setModalAbierto(true)}
          >
            Nueva reserva
          </Button>
        )}
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {(['todas', 'pendiente', 'confirmada', 'completada', 'cancelada'] as const).map((valor) => (
          <button
            key={valor}
            type="button"
            onClick={() => setFiltroEstado(valor)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              filtroEstado === valor
                ? 'bg-orange-600 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            {valor === 'todas' ? 'Todas' : ETIQUETA_ESTADO[valor]}
          </button>
        ))}
      </div>

      <Table
        columnas={[
          { encabezado: 'Fecha y hora', render: (r) => formatearFechaHora(r.fechaHora) },
          {
            encabezado: 'Cliente',
            render: (r) => `${r.cliente.nombres} ${r.cliente.apellidos ?? ''}`.trim(),
          },
          { encabezado: 'Mesa', render: (r) => `${r.mesa.salon.nombre} — ${r.mesa.numero}` },
          { encabezado: 'Personas', render: (r) => r.cantidadPersonas },
          {
            encabezado: 'Estado',
            render: (r) => <Badge tono={TONO_ESTADO[r.estado]}>{ETIQUETA_ESTADO[r.estado]}</Badge>,
          },
          {
            encabezado: '',
            render: (r) => (
              <div className="flex items-center gap-3">
                {tienePermiso('reservas.editar') && r.estado === 'pendiente' && (
                  <button
                    type="button"
                    onClick={() => cambiarEstadoMutation.mutate({ id: r.id, estado: 'confirmada' })}
                    className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-700"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Confirmar
                  </button>
                )}
                {tienePermiso('reservas.editar') && r.estado === 'confirmada' && (
                  <button
                    type="button"
                    onClick={() => cambiarEstadoMutation.mutate({ id: r.id, estado: 'completada' })}
                    className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-700"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Completar
                  </button>
                )}
                {tienePermiso('reservas.editar') &&
                  (r.estado === 'pendiente' || r.estado === 'confirmada') && (
                    <button
                      type="button"
                      onClick={() => {
                        setReservaEditando(r);
                        editarForm.reset({
                          clienteId: r.cliente.id,
                          mesaId: r.mesa.id,
                          fechaHora: aInputDatetimeLocal(r.fechaHora),
                          duracionMinutos: r.duracionMinutos,
                          cantidadPersonas: r.cantidadPersonas,
                          notas: r.notas ?? '',
                        });
                      }}
                      className="flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-700"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </button>
                  )}
                {tienePermiso('reservas.eliminar') &&
                  (r.estado === 'pendiente' || r.estado === 'confirmada') && (
                    <button
                      type="button"
                      onClick={() => setReservaCancelando(r)}
                      className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700"
                    >
                      <CalendarX2 className="h-3.5 w-3.5" />
                      Cancelar
                    </button>
                  )}
              </div>
            ),
          },
        ]}
        filas={reservasFiltradas}
        claveFila={(r) => r.id}
        vacio="No hay reservas registradas"
      />

      <Modal abierto={modalAbierto} titulo="Nueva reserva" onCerrar={() => setModalAbierto(false)}>
        <form
          onSubmit={crearForm.handleSubmit((values) => crearMutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          {crearMutation.isError && (
            <Alert
              tipo="error"
              mensaje={mensajeError(crearMutation.error, 'No se pudo crear la reserva')}
            />
          )}

          <div>
            <label className={labelClass}>Cliente</label>
            <select {...crearForm.register('clienteId', { required: true })} className={inputClass}>
              <option value="">Seleccionar…</option>
              {clientesQuery.data
                ?.filter((c) => c.activo)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombres} {c.apellidos ?? ''}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Mesa</label>
            <select {...crearForm.register('mesaId', { required: true })} className={inputClass}>
              <option value="">Seleccionar…</option>
              {mesasQuery.data
                ?.filter((m) => m.activo)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.salon.nombre} — Mesa {m.numero} ({m.capacidad} personas)
                  </option>
                ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Fecha y hora</label>
              <input
                type="datetime-local"
                {...crearForm.register('fechaHora', { required: true })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>N° de personas</label>
              <input
                type="number"
                min="1"
                {...crearForm.register('cantidadPersonas', { required: true, valueAsNumber: true })}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Duración (minutos)</label>
            <input
              type="number"
              min="15"
              step="15"
              placeholder="90"
              {...crearForm.register('duracionMinutos', { valueAsNumber: true })}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Notas</label>
            <input {...crearForm.register('notas')} className={inputClass} />
          </div>

          <Button
            type="submit"
            disabled={crearForm.formState.isSubmitting || crearMutation.isPending}
            className="mt-2 w-full"
          >
            Crear reserva
          </Button>
        </form>
      </Modal>

      <Modal
        abierto={reservaEditando !== null}
        titulo="Editar reserva"
        onCerrar={() => setReservaEditando(null)}
      >
        {reservaEditando && (
          <form
            onSubmit={editarForm.handleSubmit((values) => editarMutation.mutate(values))}
            className="flex flex-col gap-4"
          >
            {editarMutation.isError && (
              <Alert
                tipo="error"
                mensaje={mensajeError(editarMutation.error, 'No se pudo actualizar la reserva')}
              />
            )}

            <div>
              <label className={labelClass}>Cliente</label>
              <select
                {...editarForm.register('clienteId', { required: true })}
                className={inputClass}
              >
                {clientesQuery.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombres} {c.apellidos ?? ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Mesa</label>
              <select {...editarForm.register('mesaId', { required: true })} className={inputClass}>
                {mesasQuery.data?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.salon.nombre} — Mesa {m.numero} ({m.capacidad} personas)
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Fecha y hora</label>
                <input
                  type="datetime-local"
                  {...editarForm.register('fechaHora', { required: true })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>N° de personas</label>
                <input
                  type="number"
                  min="1"
                  {...editarForm.register('cantidadPersonas', {
                    required: true,
                    valueAsNumber: true,
                  })}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Duración (minutos)</label>
              <input
                type="number"
                min="15"
                step="15"
                {...editarForm.register('duracionMinutos', { valueAsNumber: true })}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Notas</label>
              <input {...editarForm.register('notas')} className={inputClass} />
            </div>

            <Button
              type="submit"
              disabled={editarForm.formState.isSubmitting || editarMutation.isPending}
              className="mt-2 w-full"
            >
              Guardar cambios
            </Button>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        abierto={reservaCancelando !== null}
        titulo="Cancelar reserva"
        mensaje={`¿Seguro que deseas cancelar la reserva de "${reservaCancelando?.cliente.nombres}"?`}
        confirmando={cancelarMutation.isPending}
        onConfirmar={() => cancelarMutation.mutate()}
        onCancelar={() => setReservaCancelando(null)}
      />
    </div>
  );
}
