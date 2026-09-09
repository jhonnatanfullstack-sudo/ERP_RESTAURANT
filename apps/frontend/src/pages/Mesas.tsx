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
import { Spinner } from '../components/ui/Spinner';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import type { ActualizarMesaInput, CrearMesaInput } from '../services/mesas.service';
import type { Mesa } from '../types/api';

const inputClass =
  'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none';
const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-700';

function mensajeError(error: unknown, fallback: string): string {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
  );
}

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

  if (mesasQuery.isLoading) return <Spinner />;

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
      />

      <Modal abierto={modalAbierto} titulo="Nueva mesa" onCerrar={() => setModalAbierto(false)}>
        <form
          onSubmit={crearForm.handleSubmit((values) => crearMutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          {crearMutation.isError && (
            <Alert
              tipo="error"
              mensaje={mensajeError(crearMutation.error, 'No se pudo crear la mesa')}
            />
          )}

          <div>
            <label className={labelClass}>Salón</label>
            <select {...crearForm.register('salonId', { required: true })} className={inputClass}>
              <option value="">Seleccionar…</option>
              {salonesQuery.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Número</label>
              <input
                {...crearForm.register('numero', { required: true })}
                className={inputClass}
                placeholder="Ej. 1, A-05"
              />
            </div>
            <div>
              <label className={labelClass}>Capacidad</label>
              <input
                type="number"
                min="1"
                {...crearForm.register('capacidad', { required: true, valueAsNumber: true })}
                className={inputClass}
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={crearForm.formState.isSubmitting || crearMutation.isPending}
            className="mt-2 w-full"
          >
            Crear mesa
          </Button>
        </form>
      </Modal>

      <Modal
        abierto={mesaEditando !== null}
        titulo="Editar mesa"
        onCerrar={() => setMesaEditando(null)}
      >
        {mesaEditando && (
          <form
            onSubmit={editarForm.handleSubmit((values) => editarMutation.mutate(values))}
            className="flex flex-col gap-4"
          >
            {editarMutation.isError && (
              <Alert
                tipo="error"
                mensaje={mensajeError(editarMutation.error, 'No se pudo actualizar la mesa')}
              />
            )}

            <div>
              <label className={labelClass}>Salón</label>
              <select
                {...editarForm.register('salonId', { required: true })}
                className={inputClass}
              >
                {salonesQuery.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Número</label>
                <input
                  {...editarForm.register('numero', { required: true })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Capacidad</label>
                <input
                  type="number"
                  min="1"
                  {...editarForm.register('capacidad', { required: true, valueAsNumber: true })}
                  className={inputClass}
                />
              </div>
            </div>

            <label className="flex items-center gap-2.5 text-sm text-zinc-700">
              <input
                type="checkbox"
                {...editarForm.register('activo')}
                className="h-4 w-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500/40"
              />
              Mesa activa
            </label>

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
