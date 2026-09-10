import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
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
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Combobox } from '../components/ui/Combobox';
import type { OpcionCombobox } from '../components/ui/Combobox';
import { Input } from '../components/ui/Input';
import { FormField } from '../components/ui/FormField';
import { FormActions } from '../components/ui/FormActions';
import { aInputDatetimeLocal, formatearFechaHora, nombreCliente } from '../utils/formato';
import { mensajeError } from '../utils/errores';
import type { ActualizarReservaInput, CrearReservaInput } from '../services/reservas.service';
import type { EstadoReserva, Reserva } from '../types/api';

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

  const opcionesClientes: OpcionCombobox[] = (clientesQuery.data ?? [])
    .filter((c) => c.activo)
    .map((c) => ({
      valor: c.id,
      etiqueta: nombreCliente(c),
      descripcion: c.telefono ?? undefined,
    }));

  const opcionesMesas: OpcionCombobox[] = (mesasQuery.data ?? [])
    .filter((m) => m.activo)
    .map((m) => ({
      valor: m.id,
      etiqueta: `${m.salon.nombre} — Mesa ${m.numero}`,
      descripcion: `${m.capacidad} personas`,
    }));

  const opcionesClientesEdicion: OpcionCombobox[] = (clientesQuery.data ?? []).map((c) => ({
    valor: c.id,
    etiqueta: `${c.nombres} ${c.apellidos ?? ''}`.trim(),
    descripcion: c.telefono ?? undefined,
  }));

  const opcionesMesasEdicion: OpcionCombobox[] = (mesasQuery.data ?? []).map((m) => ({
    valor: m.id,
    etiqueta: `${m.salon.nombre} — Mesa ${m.numero}`,
    descripcion: `${m.capacidad} personas`,
  }));

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

  function cerrarCrear() {
    setModalAbierto(false);
    crearForm.reset();
    crearMutation.reset();
  }

  function cerrarEditar() {
    setReservaEditando(null);
    editarMutation.reset();
  }

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
            render: (r) => nombreCliente(r.cliente),
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
        cargando={reservasQuery.isLoading}
        error={
          reservasQuery.isError
            ? mensajeError(reservasQuery.error, 'No se pudieron cargar las reservas')
            : undefined
        }
        onReintentar={() => void reservasQuery.refetch()}
      />

      <Modal abierto={modalAbierto} titulo="Nueva reserva" onCerrar={cerrarCrear}>
        <form
          onSubmit={crearForm.handleSubmit((values) => crearMutation.mutate(values))}
          className="flex flex-col gap-4"
          noValidate
        >
          {crearMutation.isError && (
            <Alert
              tipo="error"
              mensaje={mensajeError(crearMutation.error, 'No se pudo crear la reserva')}
            />
          )}

          <Controller
            control={crearForm.control}
            name="clienteId"
            rules={{ required: 'Selecciona el cliente de la reserva' }}
            render={({ field, fieldState }) => (
              <FormField id="reserva-cliente" label="Cliente" error={fieldState.error?.message}>
                <Combobox
                  id="reserva-cliente"
                  opciones={opcionesClientes}
                  valor={field.value}
                  onCambiar={field.onChange}
                  placeholder="Buscar cliente…"
                  vacio="No se encontraron clientes"
                />
              </FormField>
            )}
          />

          <Controller
            control={crearForm.control}
            name="mesaId"
            rules={{ required: 'Selecciona la mesa a reservar' }}
            render={({ field, fieldState }) => (
              <FormField id="reserva-mesa" label="Mesa" error={fieldState.error?.message}>
                <Combobox
                  id="reserva-mesa"
                  opciones={opcionesMesas}
                  valor={field.value}
                  onCambiar={field.onChange}
                  placeholder="Buscar mesa…"
                  vacio="No se encontraron mesas"
                />
              </FormField>
            )}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Fecha y hora"
              type="datetime-local"
              ayuda="Debe ser una fecha futura."
              error={crearForm.formState.errors.fechaHora?.message}
              {...crearForm.register('fechaHora', { required: 'Indica la fecha y hora' })}
            />
            <Input
              label="N° de personas"
              type="number"
              min="1"
              ayuda="No puede exceder la capacidad de la mesa."
              error={crearForm.formState.errors.cantidadPersonas?.message}
              {...crearForm.register('cantidadPersonas', {
                required: 'Indica cuántas personas asistirán',
                valueAsNumber: true,
                min: { value: 1, message: 'Debe ser al menos 1 persona' },
              })}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Duración (minutos)"
              type="number"
              min="15"
              step="15"
              placeholder="90"
              ayuda="Opcional. Por defecto 90 minutos."
              error={crearForm.formState.errors.duracionMinutos?.message}
              {...crearForm.register('duracionMinutos', { valueAsNumber: true })}
            />
            <Input
              label="Notas"
              ayuda="Opcional. Ej. cumpleaños, silla de bebé."
              error={crearForm.formState.errors.notas?.message}
              {...crearForm.register('notas')}
            />
          </div>

          <FormActions
            enviar="Crear reserva"
            enviandoTexto="Creando…"
            onCancelar={cerrarCrear}
            enviando={crearForm.formState.isSubmitting || crearMutation.isPending}
          />
        </form>
      </Modal>

      <Modal abierto={reservaEditando !== null} titulo="Editar reserva" onCerrar={cerrarEditar}>
        {reservaEditando && (
          <form
            onSubmit={editarForm.handleSubmit((values) => editarMutation.mutate(values))}
            className="flex flex-col gap-4"
            noValidate
          >
            {editarMutation.isError && (
              <Alert
                tipo="error"
                mensaje={mensajeError(editarMutation.error, 'No se pudo actualizar la reserva')}
              />
            )}

            <Controller
              control={editarForm.control}
              name="clienteId"
              rules={{ required: 'Selecciona el cliente de la reserva' }}
              render={({ field, fieldState }) => (
                <FormField
                  id="reserva-editar-cliente"
                  label="Cliente"
                  error={fieldState.error?.message}
                >
                  <Combobox
                    id="reserva-editar-cliente"
                    opciones={opcionesClientesEdicion}
                    valor={field.value}
                    onCambiar={field.onChange}
                    placeholder="Buscar cliente…"
                    vacio="No se encontraron clientes"
                  />
                </FormField>
              )}
            />

            <Controller
              control={editarForm.control}
              name="mesaId"
              rules={{ required: 'Selecciona la mesa a reservar' }}
              render={({ field, fieldState }) => (
                <FormField id="reserva-editar-mesa" label="Mesa" error={fieldState.error?.message}>
                  <Combobox
                    id="reserva-editar-mesa"
                    opciones={opcionesMesasEdicion}
                    valor={field.value}
                    onCambiar={field.onChange}
                    placeholder="Buscar mesa…"
                    vacio="No se encontraron mesas"
                  />
                </FormField>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Fecha y hora"
                type="datetime-local"
                ayuda="Debe ser una fecha futura."
                error={editarForm.formState.errors.fechaHora?.message}
                {...editarForm.register('fechaHora', { required: 'Indica la fecha y hora' })}
              />
              <Input
                label="N° de personas"
                type="number"
                min="1"
                ayuda="No puede exceder la capacidad de la mesa."
                error={editarForm.formState.errors.cantidadPersonas?.message}
                {...editarForm.register('cantidadPersonas', {
                  required: 'Indica cuántas personas asistirán',
                  valueAsNumber: true,
                  min: { value: 1, message: 'Debe ser al menos 1 persona' },
                })}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Duración (minutos)"
                type="number"
                min="15"
                step="15"
                ayuda="Por defecto 90 minutos."
                error={editarForm.formState.errors.duracionMinutos?.message}
                {...editarForm.register('duracionMinutos', { valueAsNumber: true })}
              />
              <Input
                label="Notas"
                ayuda="Opcional."
                error={editarForm.formState.errors.notas?.message}
                {...editarForm.register('notas')}
              />
            </div>

            <FormActions
              enviar="Guardar cambios"
              onCancelar={cerrarEditar}
              enviando={editarForm.formState.isSubmitting || editarMutation.isPending}
            />
          </form>
        )}
      </Modal>

      <ConfirmDialog
        abierto={reservaCancelando !== null}
        titulo="Cancelar reserva"
        mensaje={`¿Seguro que deseas cancelar la reserva de "${nombreCliente(reservaCancelando?.cliente ?? null)}"?`}
        confirmando={cancelarMutation.isPending}
        onConfirmar={() => cancelarMutation.mutate()}
        onCancelar={() => setReservaCancelando(null)}
      />
    </div>
  );
}
