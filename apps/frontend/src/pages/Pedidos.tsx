import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { ClipboardList, Eye, ShoppingBag, Utensils, XCircle } from 'lucide-react';
import * as pedidosService from '../services/pedidos.service';
import * as mesasService from '../services/mesas.service';
import * as reservasService from '../services/reservas.service';
import { useAuth } from '../context/AuthContext';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Combobox } from '../components/ui/Combobox';
import { TarjetaOpcion } from '../components/ui/TarjetaOpcion';
import type { OpcionCombobox } from '../components/ui/Combobox';
import { BuscadorCliente } from '../components/BuscadorCliente';
import { Input } from '../components/ui/Input';
import { FormField } from '../components/ui/FormField';
import { FormActions } from '../components/ui/FormActions';
import { mensajeError } from '../utils/errores';
import {
  formatearFechaHora,
  formatearHora,
  formatearPrecio,
  nombreCliente,
  nombreMesa,
} from '../utils/formato';
import type { CrearPedidoInput } from '../services/pedidos.service';
import type { EstadoPedido, Pedido, Reserva } from '../types/api';

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

type TipoPedido = 'mesa' | 'llevar';

export function Pedidos() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [pedidoCancelando, setPedidoCancelando] = useState<Pedido | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<'todos' | EstadoPedido>('todos');
  // No depende únicamente de que haya una mesa libre: "Para llevar" crea el pedido sin mesa.
  const [tipoPedido, setTipoPedido] = useState<TipoPedido>('mesa');

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

  function cerrarCrear() {
    setModalAbierto(false);
    crearForm.reset();
    crearMutation.reset();
    setTipoPedido('mesa');
  }

  function elegirTipoPedido(tipo: TipoPedido) {
    setTipoPedido(tipo);
    if (tipo === 'llevar') {
      // Un pedido "para llevar" no lleva mesa: se limpia por si ya se había elegido una.
      crearForm.setValue('mesaId', undefined);
    }
  }

  const pedidos = pedidosQuery.data ?? [];
  const pedidosFiltrados =
    filtroEstado === 'todos' ? pedidos : pedidos.filter((p) => p.estado === filtroEstado);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Pedidos</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Pedidos en curso y su historial — en el local o para llevar
          </p>
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
          {
            encabezado: 'Mesa',
            render: (p) => (
              <span className="flex items-center gap-1.5">
                {p.mesa ? (
                  <Utensils className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                ) : (
                  <ShoppingBag className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                )}
                {nombreMesa(p.mesa)}
              </span>
            ),
          },
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
        cargando={pedidosQuery.isLoading}
        error={
          pedidosQuery.isError
            ? mensajeError(pedidosQuery.error, 'No se pudieron cargar los pedidos')
            : undefined
        }
        onReintentar={() => void pedidosQuery.refetch()}
      />

      <Modal abierto={modalAbierto} titulo="Nuevo pedido" onCerrar={cerrarCrear}>
        <form
          onSubmit={crearForm.handleSubmit((values) => crearMutation.mutate(values))}
          className="flex flex-col gap-4"
          noValidate
        >
          {crearMutation.isError && (
            <Alert
              tipo="error"
              mensaje={mensajeError(crearMutation.error, 'No se pudo crear el pedido')}
            />
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <TarjetaOpcion
              activo={tipoPedido === 'mesa'}
              icono={Utensils}
              titulo="En el local"
              descripcion="Asigna una mesa del salón"
              onClick={() => elegirTipoPedido('mesa')}
            />
            <TarjetaOpcion
              activo={tipoPedido === 'llevar'}
              icono={ShoppingBag}
              titulo="Para llevar"
              descripcion="Sin mesa asignada"
              onClick={() => elegirTipoPedido('llevar')}
            />
          </div>

          {tipoPedido === 'mesa' && (
            <Controller
              control={crearForm.control}
              name="mesaId"
              rules={{ required: 'Selecciona la mesa del pedido' }}
              render={({ field, fieldState }) => (
                <FormField id="pedido-mesa" label="Mesa" error={fieldState.error?.message}>
                  <Combobox
                    id="pedido-mesa"
                    opciones={opcionesMesas}
                    valor={field.value}
                    onCambiar={field.onChange}
                    placeholder="Buscar mesa…"
                    vacio="No se encontraron mesas"
                  />
                </FormField>
              )}
            />
          )}

          {reservaDeSeleccion && (
            <Alert
              tipo="advertencia"
              mensaje={`Esta mesa está reservada para ${nombreCliente(reservaDeSeleccion.cliente)} a las ${formatearHora(reservaDeSeleccion.fechaHora)}. Selecciona ese mismo cliente para continuar.`}
            />
          )}

          <Controller
            control={crearForm.control}
            name="clienteId"
            rules={{
              required: reservaDeSeleccion
                ? 'Esta mesa está reservada: indica el cliente de la reserva'
                : false,
            }}
            render={({ field, fieldState }) => (
              <BuscadorCliente
                clienteId={field.value}
                onCambiar={field.onChange}
                requerido={!!reservaDeSeleccion}
                error={fieldState.error?.message}
              />
            )}
          />

          <Input
            label="Notas"
            ayuda="Opcional. Ej. cumpleaños, cliente con apuro, alergias."
            error={crearForm.formState.errors.notas?.message}
            {...crearForm.register('notas')}
          />

          <FormActions
            enviar="Crear pedido"
            enviandoTexto="Creando…"
            onCancelar={cerrarCrear}
            enviando={crearForm.formState.isSubmitting || crearMutation.isPending}
          />
        </form>
      </Modal>

      <ConfirmDialog
        abierto={pedidoCancelando !== null}
        titulo="Cancelar pedido"
        mensaje={`¿Seguro que deseas cancelar el pedido de "${pedidoCancelando ? nombreMesa(pedidoCancelando.mesa) : ''}"?`}
        confirmando={cancelarMutation.isPending}
        onConfirmar={() => cancelarMutation.mutate()}
        onCancelar={() => setPedidoCancelando(null)}
      />
    </div>
  );
}
