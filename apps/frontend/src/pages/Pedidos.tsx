import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import {
  Banknote,
  ClipboardList,
  CreditCard,
  Eye,
  ShoppingBag,
  Smartphone,
  Timer,
  Utensils,
  XCircle,
} from 'lucide-react';
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
import { TarjetaOpcion } from '../components/ui/TarjetaOpcion';
import { PlanoMesas } from '../components/PlanoMesas';
import { BuscadorCliente } from '../components/BuscadorCliente';
import { Input } from '../components/ui/Input';
import { FormField } from '../components/ui/FormField';
import { FormActions } from '../components/ui/FormActions';
import { mensajeError } from '../utils/errores';
import { reservaActivaDeMesa } from '../utils/estadoMesa';
import { minutosDesde } from '../utils/metricas';
import {
  formatearFechaHora,
  formatearHora,
  formatearPrecio,
  nombreCliente,
  nombreMesa,
} from '../utils/formato';
import type { CrearPedidoInput } from '../services/pedidos.service';
import type { EstadoPedido, MedioPagoPreferido, Pedido } from '../types/api';

/** Mismo criterio de `PedidoDetalle.tsx`: no es un cobro real, solo lo que el cliente dijo que
 * iba a usar al armar un pedido público. */
const ICONO_MEDIO_PAGO: Record<MedioPagoPreferido, typeof Banknote> = {
  efectivo: Banknote,
  yape: Smartphone,
  plin: Smartphone,
  tarjeta: CreditCard,
};

const ETIQUETA_MEDIO_PAGO: Record<MedioPagoPreferido, string> = {
  efectivo: 'Efectivo',
  yape: 'Yape',
  plin: 'Plin',
  tarjeta: 'Tarjeta',
};

/** Mismo umbral que el Dashboard para marcar en rojo un pedido que lleva demasiado abierto. */
const MINUTOS_URGENTE = 20;

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

/** Por dónde entró el pedido — `salon` es el caso de siempre (un mesero lo abre); los otros
 * tres los arma el propio cliente desde la carta pública, sin pasar por nadie del staff hasta
 * que alguien lo revisa acá. */
const ETIQUETA_CANAL: Record<Pedido['canalOrigen'], string> = {
  salon: 'Salón',
  autopedido: 'Autopedido (QR)',
  delivery: 'Delivery',
  recojo: 'Recojo',
};

const TONO_CANAL: Record<Pedido['canalOrigen'], 'exito' | 'neutral' | 'peligro'> = {
  salon: 'neutral',
  autopedido: 'exito',
  delivery: 'exito',
  recojo: 'exito',
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
  // Reloj propio para que "hace X min" de cada pedido abierto avance solo, sin depender de que
  // React Query vuelva a pedir la lista.
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const pedidosQuery = useQuery({ queryKey: ['pedidos'], queryFn: pedidosService.listarPedidos });
  const mesasQuery = useQuery({ queryKey: ['mesas'], queryFn: mesasService.listarMesas });
  const reservasQuery = useQuery({
    queryKey: ['reservas'],
    queryFn: reservasService.listarReservas,
  });
  const crearForm = useForm<CrearPedidoInput>();
  const mesaSeleccionada = useWatch({ control: crearForm.control, name: 'mesaId' });
  const reservaDeSeleccion = mesaSeleccionada
    ? reservaActivaDeMesa(mesaSeleccionada, reservasQuery.data ?? [])
    : undefined;

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
              <div>
                <span className="flex items-center gap-1.5">
                  {p.mesa ? (
                    <Utensils className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                  ) : (
                    <ShoppingBag className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                  )}
                  {nombreMesa(p.mesa)}
                </span>
                {(p.contactoNombre || p.contactoTelefono) && (
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {[p.contactoNombre, p.contactoTelefono].filter(Boolean).join(' · ')}
                  </p>
                )}
                {p.direccionEntrega && (
                  <p className="text-xs text-zinc-500">{p.direccionEntrega}</p>
                )}
                {p.medioPagoPreferido &&
                  (() => {
                    const Icono = ICONO_MEDIO_PAGO[p.medioPagoPreferido];
                    return (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-orange-700">
                        <Icono className="h-3 w-3" />
                        {ETIQUETA_MEDIO_PAGO[p.medioPagoPreferido]}
                        {p.vueltoPara != null &&
                          ` · vuelto ${formatearPrecio(p.vueltoPara - p.total)}`}
                      </p>
                    );
                  })()}
              </div>
            ),
          },
          {
            encabezado: 'Origen',
            render: (p) => (
              <Badge tono={TONO_CANAL[p.canalOrigen]}>{ETIQUETA_CANAL[p.canalOrigen]}</Badge>
            ),
          },
          {
            encabezado: 'Apertura',
            render: (p) => {
              if (p.estado !== 'abierto') return formatearFechaHora(p.creadoEn);
              const minutos = minutosDesde(p.creadoEn, ahora);
              const urgente = minutos >= MINUTOS_URGENTE;
              return (
                <div>
                  <p>{formatearFechaHora(p.creadoEn)}</p>
                  <p
                    className={`mt-0.5 flex items-center gap-1 text-xs font-semibold tabular-nums ${
                      urgente ? 'text-red-600' : 'text-zinc-400'
                    }`}
                  >
                    <Timer className="h-3 w-3" />
                    {minutos} min
                  </p>
                </div>
              );
            },
          },
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

      <Modal
        abierto={modalAbierto}
        titulo="Nuevo pedido"
        onCerrar={cerrarCrear}
        tamano={tipoPedido === 'mesa' ? 'lg' : 'md'}
      >
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
                  <PlanoMesas
                    mesas={(mesasQuery.data ?? []).filter((m) => m.activo)}
                    pedidos={pedidosQuery.data ?? []}
                    reservas={reservasQuery.data ?? []}
                    vacio="No hay mesas activas"
                    seleccionadaId={field.value}
                    onSeleccionar={(mesa) => field.onChange(mesa.id)}
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
