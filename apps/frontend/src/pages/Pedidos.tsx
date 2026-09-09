import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { ClipboardList, Eye, XCircle } from 'lucide-react';
import * as pedidosService from '../services/pedidos.service';
import * as mesasService from '../services/mesas.service';
import * as reservasService from '../services/reservas.service';
import { useAuth } from '../context/AuthContext';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Combobox } from '../components/ui/Combobox';
import type { OpcionCombobox } from '../components/ui/Combobox';
import { BuscadorCliente } from '../components/BuscadorCliente';
import {
  formatearFechaHora,
  formatearHora,
  formatearPrecio,
  nombreCliente,
} from '../utils/formato';
import type { CrearPedidoInput } from '../services/pedidos.service';
import type { EstadoPedido, Pedido, Reserva } from '../types/api';

const inputClass =
  'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none';
const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-700';

const ETIQUETA_ESTADO: Record<EstadoPedido, string> = {
  abierto: 'Abierto',
  cerrado: 'Cerrado',
  cancelado: 'Cancelado',
};

const TONO_ESTADO: Record<EstadoPedido, 'exito' | 'neutral' | 'peligro'> = {
  abierto: 'exito',
  cerrado: 'neutral',
  cancelado: 'peligro',
};

function mensajeError(error: unknown, fallback: string): string {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
  );
}

export function Pedidos() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [pedidoCancelando, setPedidoCancelando] = useState<Pedido | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<'todos' | EstadoPedido>('todos');

  const pedidosQuery = useQuery({ queryKey: ['pedidos'], queryFn: pedidosService.listarPedidos });
  const mesasQuery = useQuery({ queryKey: ['mesas'], queryFn: mesasService.listarMesas });
  const reservasQuery = useQuery({
    queryKey: ['reservas'],
    queryFn: reservasService.listarReservas,
  });
  function reservaActivaDeMesa(mesaId: string): Reserva | undefined {
    const ahora = new Date().getTime();
    return (reservasQuery.data ?? []).find((r) => {
      if (r.mesa.id !== mesaId) return false;
      if (r.estado !== 'pendiente' && r.estado !== 'confirmada') return false;
      const inicio = new Date(r.fechaHora).getTime();
      const fin = inicio + r.duracionMinutos * 60_000;
      return ahora >= inicio && ahora < fin;
    });
  }

  const opcionesMesas: OpcionCombobox[] = (mesasQuery.data ?? [])
    .filter((m) => m.activo)
    .map((m) => {
      const reserva = reservaActivaDeMesa(m.id);
      return {
        valor: m.id,
        etiqueta: `${m.salon.nombre} — Mesa ${m.numero}`,
        descripcion: reserva
          ? `Reservada — ${nombreCliente(reserva.cliente)} ${formatearHora(reserva.fechaHora)}`
          : `${m.capacidad} personas`,
      };
    });

  const crearForm = useForm<CrearPedidoInput>();
  const mesaSeleccionada = useWatch({ control: crearForm.control, name: 'mesaId' });
  const reservaDeSeleccion = mesaSeleccionada ? reservaActivaDeMesa(mesaSeleccionada) : undefined;

  const crearMutation = useMutation({
    mutationFn: pedidosService.crearPedido,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pedidos'] });
      setModalAbierto(false);
      crearForm.reset();
    },
  });

  const cancelarMutation = useMutation({
    mutationFn: () => pedidosService.cancelarPedido(pedidoCancelando!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pedidos'] });
      setPedidoCancelando(null);
    },
  });

  if (pedidosQuery.isLoading) return <Spinner />;

  const pedidos = pedidosQuery.data ?? [];
  const pedidosFiltrados =
    filtroEstado === 'todos' ? pedidos : pedidos.filter((p) => p.estado === filtroEstado);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Pedidos</h1>
          <p className="mt-1 text-sm text-zinc-500">Pedidos de mesa en curso y su historial</p>
        </div>
        {tienePermiso('pedidos.crear') && (
          <Button
            icono={<ClipboardList className="h-4 w-4" />}
            onClick={() => setModalAbierto(true)}
          >
            Nuevo pedido
          </Button>
        )}
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {(['todos', 'abierto', 'cerrado', 'cancelado'] as const).map((valor) => (
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
            {valor === 'todos' ? 'Todos' : ETIQUETA_ESTADO[valor]}
          </button>
        ))}
      </div>

      <Table
        columnas={[
          { encabezado: 'Mesa', render: (p) => `${p.mesa.salon.nombre} — ${p.mesa.numero}` },
          { encabezado: 'Apertura', render: (p) => formatearFechaHora(p.creadoEn) },
          { encabezado: 'Productos', render: (p) => p.detalles.length },
          { encabezado: 'Total', render: (p) => formatearPrecio(p.total) },
          {
            encabezado: 'Estado',
            render: (p) => <Badge tono={TONO_ESTADO[p.estado]}>{ETIQUETA_ESTADO[p.estado]}</Badge>,
          },
          {
            encabezado: '',
            render: (p) => (
              <div className="flex items-center gap-3">
                <Link
                  to={`/pedidos/${p.id}`}
                  className="flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-700"
                >
                  <Eye className="h-3.5 w-3.5" />
                  {p.estado === 'abierto' ? 'Gestionar' : 'Ver'}
                </Link>
                {tienePermiso('pedidos.eliminar') && p.estado === 'abierto' && (
                  <button
                    type="button"
                    onClick={() => setPedidoCancelando(p)}
                    className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Cancelar
                  </button>
                )}
              </div>
            ),
          },
        ]}
        filas={pedidosFiltrados}
        claveFila={(p) => p.id}
        vacio="No hay pedidos registrados"
      />

      <Modal abierto={modalAbierto} titulo="Nuevo pedido" onCerrar={() => setModalAbierto(false)}>
        <form
          onSubmit={crearForm.handleSubmit((values) => crearMutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          {crearMutation.isError && (
            <Alert
              tipo="error"
              mensaje={mensajeError(crearMutation.error, 'No se pudo crear el pedido')}
            />
          )}

          <div>
            <label className={labelClass}>Mesa</label>
            <Controller
              control={crearForm.control}
              name="mesaId"
              rules={{ required: true }}
              render={({ field }) => (
                <Combobox
                  opciones={opcionesMesas}
                  valor={field.value}
                  onCambiar={field.onChange}
                  placeholder="Buscar mesa…"
                  vacio="No se encontraron mesas"
                />
              )}
            />
          </div>

          {reservaDeSeleccion && (
            <Alert
              tipo="error"
              mensaje={`Esta mesa está reservada para ${nombreCliente(reservaDeSeleccion.cliente)} a las ${formatearHora(reservaDeSeleccion.fechaHora)}. Selecciona ese mismo cliente para continuar.`}
            />
          )}

          <Controller
            control={crearForm.control}
            name="clienteId"
            rules={{ required: !!reservaDeSeleccion }}
            render={({ field }) => (
              <BuscadorCliente
                clienteId={field.value}
                onCambiar={field.onChange}
                requerido={!!reservaDeSeleccion}
              />
            )}
          />

          <div>
            <label className={labelClass}>Notas</label>
            <input {...crearForm.register('notas')} className={inputClass} />
          </div>

          <Button
            type="submit"
            disabled={crearForm.formState.isSubmitting || crearMutation.isPending}
            className="mt-2 w-full"
          >
            Crear pedido
          </Button>
        </form>
      </Modal>

      <ConfirmDialog
        abierto={pedidoCancelando !== null}
        titulo="Cancelar pedido"
        mensaje={`¿Seguro que deseas cancelar el pedido de la mesa "${pedidoCancelando?.mesa.numero}"?`}
        confirmando={cancelarMutation.isPending}
        onConfirmar={() => cancelarMutation.mutate()}
        onCancelar={() => setPedidoCancelando(null)}
      />
    </div>
  );
}
