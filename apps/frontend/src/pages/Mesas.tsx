import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Pencil, Trash2, Utensils } from 'lucide-react';
import * as mesasService from '../services/mesas.service';
import * as salonesService from '../services/salones.service';
import * as reservasService from '../services/reservas.service';
import * as pedidosService from '../services/pedidos.service';
import { formatearHora } from '../utils/formato';
import { useAuth } from '../context/AuthContext';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Checkbox } from '../components/ui/Checkbox';
import { FormActions } from '../components/ui/FormActions';
import { mensajeError } from '../utils/errores';
import type { ActualizarMesaInput, CrearMesaInput } from '../services/mesas.service';
import type { Mesa } from '../types/api';

export function Mesas() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [mesaEditando, setMesaEditando] = useState<Mesa | null>(null);
  const [mesaEliminando, setMesaEliminando] = useState<Mesa | null>(null);
  const [filtroSalon, setFiltroSalon] = useState<string>('todos');

  const mesasQuery = useQuery({ queryKey: ['mesas'], queryFn: mesasService.listarMesas });
  const salonesQuery = useQuery({ queryKey: ['salones'], queryFn: salonesService.listarSalones });
  const reservasQuery = useQuery({
    queryKey: ['reservas'],
    queryFn: reservasService.listarReservas,
  });
  const pedidosQuery = useQuery({
    queryKey: ['pedidos'],
    queryFn: pedidosService.listarPedidos,
  });

  function estadoOcupacion(mesaId: string): {
    etiqueta: string;
    tono: 'exito' | 'neutral' | 'peligro';
  } {
    const tienePedidoAbierto = (pedidosQuery.data ?? []).some(
      (p) => p.mesa?.id === mesaId && p.estado === 'abierto',
    );
    if (tienePedidoAbierto) return { etiqueta: 'Ocupada', tono: 'peligro' };

    const ahora = new Date().getTime();
    const reserva = (reservasQuery.data ?? []).find((r) => {
      if (r.mesa.id !== mesaId) return false;
      if (r.estado !== 'pendiente' && r.estado !== 'confirmada') return false;
      const inicio = new Date(r.fechaHora).getTime();
      const fin = inicio + r.duracionMinutos * 60_000;
      return ahora >= inicio && ahora < fin;
    });
    if (reserva)
      return { etiqueta: `Reservada ${formatearHora(reserva.fechaHora)}`, tono: 'neutral' };

    return { etiqueta: 'Libre', tono: 'exito' };
  }

  const crearForm = useForm<CrearMesaInput>();
  const editarForm = useForm<ActualizarMesaInput>();

  const crearMutation = useMutation({
    mutationFn: mesasService.crearMesa,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mesas'] });
      setModalAbierto(false);
      crearForm.reset();
    },
  });

  const editarMutation = useMutation({
    mutationFn: (values: ActualizarMesaInput) =>
      mesasService.actualizarMesa(mesaEditando!.id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mesas'] });
      setMesaEditando(null);
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: () => mesasService.eliminarMesa(mesaEliminando!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mesas'] });
      setMesaEliminando(null);
    },
  });

  function cerrarCrear() {
    setModalAbierto(false);
    crearForm.reset();
    crearMutation.reset();
  }

  function cerrarEditar() {
    setMesaEditando(null);
    editarMutation.reset();
  }

  const mesas = mesasQuery.data ?? [];
  const mesasFiltradas =
    filtroSalon === 'todos' ? mesas : mesas.filter((m) => m.salon.id === filtroSalon);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Mesas</h1>
          <p className="mt-1 text-sm text-zinc-500">Mesas disponibles por salón</p>
        </div>
        {tienePermiso('mesas.crear') && (
          <Button icono={<Utensils className="h-4 w-4" />} onClick={() => setModalAbierto(true)}>
            Nueva mesa
          </Button>
        )}
      </div>

      {salonesQuery.data && salonesQuery.data.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFiltroSalon('todos')}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              filtroSalon === 'todos'
                ? 'bg-orange-600 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            Todos
          </button>
          {salonesQuery.data.map((salon) => (
            <button
              key={salon.id}
              type="button"
              onClick={() => setFiltroSalon(salon.id)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                filtroSalon === salon.id
                  ? 'bg-orange-600 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {salon.nombre}
            </button>
          ))}
        </div>
      )}

      <Table
        columnas={[
          { encabezado: 'Salón', render: (m) => m.salon.nombre },
          { encabezado: 'Número', render: (m) => m.numero },
          { encabezado: 'Capacidad', render: (m) => `${m.capacidad} personas` },
          {
            encabezado: 'Ocupación',
            render: (m) => {
              const { etiqueta, tono } = estadoOcupacion(m.id);
              return <Badge tono={tono}>{etiqueta}</Badge>;
            },
          },
          {
            encabezado: 'Estado',
            render: (m) => (
              <Badge tono={m.activo ? 'exito' : 'neutral'}>
                {m.activo ? 'Activa' : 'Inactiva'}
              </Badge>
            ),
          },
          {
            encabezado: '',
            render: (m) => (
              <div className="flex items-center gap-3">
                {tienePermiso('mesas.editar') && (
                  <button
                    type="button"
                    onClick={() => {
                      setMesaEditando(m);
                      editarForm.reset({
                        salonId: m.salon.id,
                        numero: m.numero,
                        capacidad: m.capacidad,
                        activo: m.activo,
                      });
                    }}
                    className="flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-700"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </button>
                )}
                {tienePermiso('mesas.eliminar') && (
                  <button
                    type="button"
                    onClick={() => setMesaEliminando(m)}
                    className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Eliminar
                  </button>
                )}
              </div>
            ),
          },
        ]}
        filas={mesasFiltradas}
        claveFila={(m) => m.id}
        vacio="No hay mesas registradas"
        cargando={mesasQuery.isLoading}
        error={
          mesasQuery.isError
            ? mensajeError(mesasQuery.error, 'No se pudieron cargar las mesas')
            : undefined
        }
        onReintentar={() => void mesasQuery.refetch()}
      />

      <Modal abierto={modalAbierto} titulo="Nueva mesa" onCerrar={cerrarCrear}>
        <form
          onSubmit={crearForm.handleSubmit((values) => crearMutation.mutate(values))}
          className="flex flex-col gap-4"
          noValidate
        >
          {crearMutation.isError && (
            <Alert
              tipo="error"
              mensaje={mensajeError(crearMutation.error, 'No se pudo crear la mesa')}
            />
          )}

          <Select
            label="Salón"
            error={crearForm.formState.errors.salonId?.message}
            {...crearForm.register('salonId', { required: 'Selecciona el salón' })}
          >
            <option value="">Seleccionar…</option>
            {salonesQuery.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </Select>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Número"
              placeholder="Ej. 1, A-05"
              ayuda="Único dentro del salón."
              error={crearForm.formState.errors.numero?.message}
              {...crearForm.register('numero', { required: 'El número es obligatorio' })}
            />
            <Input
              label="Capacidad"
              type="number"
              min="1"
              ayuda="Cantidad de personas."
              error={crearForm.formState.errors.capacidad?.message}
              {...crearForm.register('capacidad', {
                required: 'La capacidad es obligatoria',
                valueAsNumber: true,
                min: { value: 1, message: 'La capacidad debe ser al menos 1' },
              })}
            />
          </div>

          <FormActions
            enviar="Crear mesa"
            enviandoTexto="Creando…"
            onCancelar={cerrarCrear}
            enviando={crearForm.formState.isSubmitting || crearMutation.isPending}
          />
        </form>
      </Modal>

      <Modal abierto={mesaEditando !== null} titulo="Editar mesa" onCerrar={cerrarEditar}>
        {mesaEditando && (
          <form
            onSubmit={editarForm.handleSubmit((values) => editarMutation.mutate(values))}
            className="flex flex-col gap-4"
            noValidate
          >
            {editarMutation.isError && (
              <Alert
                tipo="error"
                mensaje={mensajeError(editarMutation.error, 'No se pudo actualizar la mesa')}
              />
            )}

            <Select
              label="Salón"
              error={editarForm.formState.errors.salonId?.message}
              {...editarForm.register('salonId', { required: 'Selecciona el salón' })}
            >
              {salonesQuery.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Select>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Número"
                ayuda="Único dentro del salón."
                error={editarForm.formState.errors.numero?.message}
                {...editarForm.register('numero', { required: 'El número es obligatorio' })}
              />
              <Input
                label="Capacidad"
                type="number"
                min="1"
                ayuda="Cantidad de personas."
                error={editarForm.formState.errors.capacidad?.message}
                {...editarForm.register('capacidad', {
                  required: 'La capacidad es obligatoria',
                  valueAsNumber: true,
                  min: { value: 1, message: 'La capacidad debe ser al menos 1' },
                })}
              />
            </div>

            <Checkbox
              label="Mesa activa"
              ayuda="Las mesas inactivas no admiten nuevos pedidos ni reservas."
              {...editarForm.register('activo')}
            />

            <FormActions
              enviar="Guardar cambios"
              onCancelar={cerrarEditar}
              enviando={editarForm.formState.isSubmitting || editarMutation.isPending}
            />
          </form>
        )}
      </Modal>

      <ConfirmDialog
        abierto={mesaEliminando !== null}
        titulo="Eliminar mesa"
        mensaje={`¿Seguro que deseas eliminar la mesa "${mesaEliminando?.numero}" del salón "${mesaEliminando?.salon.nombre}"? Esta acción no se puede deshacer.`}
        confirmando={eliminarMutation.isPending}
        onConfirmar={() => eliminarMutation.mutate()}
        onCancelar={() => setMesaEliminando(null)}
      />
    </div>
  );
}
