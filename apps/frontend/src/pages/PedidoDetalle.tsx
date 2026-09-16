import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { AnimatePresence, motion } from 'framer-motion';
import { Link, useNavigate, useParams } from 'react-router';
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  CreditCard,
  Pencil,
  Plus,
  Send,
  ShoppingBag,
  Smartphone,
  Timer,
  Trash2,
  Utensils,
  XCircle,
} from 'lucide-react';
import * as pedidosService from '../services/pedidos.service';
import * as productosService from '../services/productos.service';
import * as comandasService from '../services/comandas.service';
import { useAuth } from '../context/AuthContext';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { FormField } from '../components/ui/FormField';
import { FormActions } from '../components/ui/FormActions';
import { mensajeError } from '../utils/errores';
import { Combobox } from '../components/ui/Combobox';
import type { OpcionCombobox } from '../components/ui/Combobox';
import { formatearFechaHora, formatearPrecio, nombreCliente, nombreMesa } from '../utils/formato';
import { minutosDesde } from '../utils/metricas';
import type { AgregarDetalleInput } from '../services/pedidos.service';
import type { DetallePedido, EstadoComanda, EstadoPedido, MedioPagoPreferido } from '../types/api';

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

const ETIQUETA_COMANDA: Record<EstadoComanda, string> = {
  pendiente: 'En cola',
  en_preparacion: 'Preparando',
  listo: 'Listo',
  entregado: 'Entregado',
  cancelada: 'Cancelada',
};

const TONO_COMANDA: Record<EstadoComanda, 'exito' | 'neutral' | 'peligro'> = {
  pendiente: 'neutral',
  en_preparacion: 'neutral',
  listo: 'exito',
  entregado: 'neutral',
  cancelada: 'peligro',
};

/** Solo se llena en un pedido que llegó de la carta pública — ver `Pedido.medioPagoPreferido`.
 * No es un cobro real (eso sigue pasando por Caja), es lo que el cliente dijo que iba a usar. */
const MEDIO_PAGO: Record<MedioPagoPreferido, { etiqueta: string; icono: typeof Banknote }> = {
  efectivo: { etiqueta: 'Efectivo', icono: Banknote },
  yape: { etiqueta: 'Yape', icono: Smartphone },
  plin: { etiqueta: 'Plin', icono: Smartphone },
  tarjeta: { etiqueta: 'Tarjeta', icono: CreditCard },
};

/** A partir de cuántos minutos abierto un pedido se resalta — mismo umbral que usa el
 * Dashboard para la cola de cocina. */
const MINUTOS_URGENTE = 20;

export function PedidoDetalle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [detalleEditando, setDetalleEditando] = useState<DetallePedido | null>(null);
  const [detalleEliminando, setDetalleEliminando] = useState<DetallePedido | null>(null);
  const [confirmandoCierre, setConfirmandoCierre] = useState(false);
  const [confirmandoCancelacion, setConfirmandoCancelacion] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const pedidoQuery = useQuery({
    queryKey: ['pedidos', id],
    queryFn: () => pedidosService.obtenerPedido(id!),
    enabled: !!id,
  });
  const productosQuery = useQuery({
    queryKey: ['productos'],
    queryFn: productosService.listarProductos,
  });

  const opcionesProductos: OpcionCombobox[] = (productosQuery.data ?? [])
    .filter((p) => p.activo)
    .map((p) => ({
      valor: p.id,
      etiqueta: p.nombre,
      descripcion: formatearPrecio(p.precio),
    }));

  const agregarForm = useForm<AgregarDetalleInput>({ defaultValues: { cantidad: 1 } });
  const editarForm = useForm<{ cantidad: number; notas: string }>();

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['pedidos', id] });
    queryClient.invalidateQueries({ queryKey: ['pedidos'] });
  }

  const agregarMutation = useMutation({
    mutationFn: (values: AgregarDetalleInput) => pedidosService.agregarDetalle(id!, values),
    onSuccess: () => {
      invalidar();
      agregarForm.reset({ cantidad: 1, productoId: '', notas: '' });
    },
  });

  const editarMutation = useMutation({
    mutationFn: (values: { cantidad: number; notas: string }) =>
      pedidosService.actualizarDetalle(id!, detalleEditando!.id, {
        cantidad: values.cantidad,
        notas: values.notas || null,
      }),
    onSuccess: () => {
      invalidar();
      setDetalleEditando(null);
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: () => pedidosService.eliminarDetalle(id!, detalleEliminando!.id),
    onSuccess: () => {
      invalidar();
      setDetalleEliminando(null);
    },
  });

  const enviarComandaMutation = useMutation({
    mutationFn: () =>
      comandasService.crearComanda({ pedidoId: id!, detalleIds: [...seleccionados] }),
    onSuccess: () => {
      invalidar();
      setSeleccionados(new Set());
    },
  });

  function alternarSeleccion(detalleId: string) {
    setSeleccionados((previo) => {
      const nuevo = new Set(previo);
      if (nuevo.has(detalleId)) {
        nuevo.delete(detalleId);
      } else {
        nuevo.add(detalleId);
      }
      return nuevo;
    });
  }

  const cerrarMutation = useMutation({
    mutationFn: () => pedidosService.actualizarPedido(id!, { estado: 'cerrado' }),
    onSuccess: () => {
      invalidar();
      setConfirmandoCierre(false);
    },
  });

  const cancelarMutation = useMutation({
    mutationFn: () => pedidosService.cancelarPedido(id!),
    onSuccess: () => {
      invalidar();
      setConfirmandoCancelacion(false);
      navigate('/pedidos');
    },
  });

  function cerrarEdicionLinea() {
    setDetalleEditando(null);
    editarMutation.reset();
  }

  if (pedidoQuery.isLoading) return <Spinner />;
  if (!pedidoQuery.data) {
    return <EmptyState icono={XCircle} titulo="Pedido no encontrado" />;
  }

  const pedido = pedidoQuery.data;
  const puedeEditar = pedido.estado === 'abierto' && tienePermiso('pedidos.editar');

  return (
    <div>
      <Link
        to="/pedidos"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a pedidos
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-900">
              {pedido.mesa ? (
                <Utensils className="h-5 w-5 text-zinc-400" />
              ) : (
                <ShoppingBag className="h-5 w-5 text-zinc-400" />
              )}
              {nombreMesa(pedido.mesa)}
            </h1>
            <Badge tono={TONO_ESTADO[pedido.estado]}>{ETIQUETA_ESTADO[pedido.estado]}</Badge>
            {pedido.estado === 'abierto' &&
              (() => {
                const minutos = minutosDesde(pedido.creadoEn, ahora);
                const urgente = minutos >= MINUTOS_URGENTE;
                return (
                  <span
                    className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                      urgente ? 'bg-red-100 text-red-700' : 'bg-zinc-100 text-zinc-500'
                    }`}
                  >
                    <Timer className="h-3 w-3" />
                    {minutos} min abierto
                  </span>
                );
              })()}
            {pedido.medioPagoPreferido &&
              (() => {
                const { etiqueta, icono: Icono } = MEDIO_PAGO[pedido.medioPagoPreferido];
                return (
                  <span className="flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700">
                    <Icono className="h-3 w-3" />
                    {etiqueta}
                    {pedido.vueltoPara != null &&
                      ` · vuelto de ${formatearPrecio(pedido.vueltoPara - pedido.total)}`}
                  </span>
                );
              })()}
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            {pedido.cliente && <>Cliente: {nombreCliente(pedido.cliente)} · </>}
            Abierto el {formatearFechaHora(pedido.creadoEn)}
            {pedido.fechaCierre && ` · Cerrado el ${formatearFechaHora(pedido.fechaCierre)}`}
          </p>
        </div>

        {pedido.estado === 'abierto' && (
          <div className="flex items-center gap-3">
            {tienePermiso('pedidos.eliminar') && (
              <Button variante="secondary" onClick={() => setConfirmandoCancelacion(true)}>
                Cancelar pedido
              </Button>
            )}
            {tienePermiso('pedidos.editar') && (
              <Button
                icono={<CheckCircle2 className="h-4 w-4" />}
                onClick={() => setConfirmandoCierre(true)}
                disabled={pedido.detalles.length === 0}
              >
                Cerrar pedido
              </Button>
            )}
          </div>
        )}
      </div>

      {enviarComandaMutation.isError && (
        <div className="mb-4">
          <Alert
            tipo="error"
            mensaje={mensajeError(enviarComandaMutation.error, 'No se pudo enviar a cocina')}
          />
        </div>
      )}

      <AnimatePresence>
        {puedeEditar && seleccionados.size > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="flex items-center justify-between rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
              <p className="text-sm font-medium text-orange-800">
                {seleccionados.size} producto{seleccionados.size === 1 ? '' : 's'} seleccionado
                {seleccionados.size === 1 ? '' : 's'}
              </p>
              <Button
                icono={<Send className="h-4 w-4" />}
                onClick={() => enviarComandaMutation.mutate()}
                disabled={enviarComandaMutation.isPending}
              >
                Enviar a cocina
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        {pedido.detalles.length === 0 ? (
          <EmptyState icono={XCircle} titulo="Aún no se agregaron productos" />
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th className="px-5 py-3 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                  Producto
                </th>
                <th className="px-5 py-3 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                  Cantidad
                </th>
                <th className="px-5 py-3 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                  Precio unit.
                </th>
                <th className="px-5 py-3 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                  Subtotal
                </th>
                <th className="px-5 py-3 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                  Notas
                </th>
                <th className="px-5 py-3 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                  Cocina
                </th>
                {puedeEditar && <th className="px-5 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {pedido.detalles.map((detalle) => {
                const puedeEditarLinea = puedeEditar && !detalle.comanda;
                return (
                  <tr key={detalle.id} className="hover:bg-zinc-50">
                    <td className="px-5 py-3.5 font-medium text-zinc-900">
                      {detalle.producto.nombre}
                    </td>
                    <td className="px-5 py-3.5 text-zinc-700">{detalle.cantidad}</td>
                    <td className="px-5 py-3.5 text-zinc-700">
                      {formatearPrecio(detalle.precioUnitario)}
                    </td>
                    <td className="px-5 py-3.5 font-medium text-zinc-900">
                      {formatearPrecio(detalle.subtotal)}
                    </td>
                    <td className="px-5 py-3.5 text-zinc-500">{detalle.notas ?? '—'}</td>
                    <td className="px-5 py-3.5">
                      {detalle.comanda ? (
                        <Badge tono={TONO_COMANDA[detalle.comanda.estado]}>
                          {ETIQUETA_COMANDA[detalle.comanda.estado]}
                        </Badge>
                      ) : puedeEditar ? (
                        <label className="flex items-center gap-2 text-xs text-zinc-500">
                          <input
                            type="checkbox"
                            checked={seleccionados.has(detalle.id)}
                            onChange={() => alternarSeleccion(detalle.id)}
                            className="h-4 w-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500/40"
                          />
                          Enviar
                        </label>
                      ) : (
                        <span className="text-xs text-zinc-400">Sin enviar</span>
                      )}
                    </td>
                    {puedeEditar && (
                      <td className="px-5 py-3.5">
                        {puedeEditarLinea && (
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                setDetalleEditando(detalle);
                                editarForm.reset({
                                  cantidad: detalle.cantidad,
                                  notas: detalle.notas ?? '',
                                });
                              }}
                              className="flex items-center gap-1 text-orange-600 hover:text-orange-700"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDetalleEliminando(detalle)}
                              className="flex items-center gap-1 text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-200 bg-zinc-50">
                <td colSpan={puedeEditar ? 6 : 5} className="px-5 py-3 text-right font-semibold">
                  Total
                </td>
                <td className="px-5 py-3 text-lg font-bold text-zinc-900">
                  {formatearPrecio(pedido.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {puedeEditar && (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-zinc-700">Agregar producto</h2>
          {agregarMutation.isError && (
            <div className="mb-4">
              <Alert
                tipo="error"
                mensaje={mensajeError(agregarMutation.error, 'No se pudo agregar el producto')}
              />
            </div>
          )}
          <form
            onSubmit={agregarForm.handleSubmit((values) => agregarMutation.mutate(values))}
            className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[1fr_110px_1fr_auto]"
            noValidate
          >
            <Controller
              control={agregarForm.control}
              name="productoId"
              rules={{ required: 'Elige un producto' }}
              render={({ field, fieldState }) => (
                <FormField id="linea-producto" label="Producto" error={fieldState.error?.message}>
                  <Combobox
                    id="linea-producto"
                    opciones={opcionesProductos}
                    valor={field.value}
                    onCambiar={field.onChange}
                    placeholder="Buscar producto…"
                    vacio="No se encontraron productos"
                  />
                </FormField>
              )}
            />
            <Input
              label="Cantidad"
              type="number"
              min="1"
              error={agregarForm.formState.errors.cantidad?.message}
              {...agregarForm.register('cantidad', {
                required: 'Indica la cantidad',
                valueAsNumber: true,
                min: { value: 1, message: 'Mínimo 1' },
              })}
            />
            <Input
              label="Notas"
              placeholder="Ej. sin cebolla"
              error={agregarForm.formState.errors.notas?.message}
              {...agregarForm.register('notas')}
            />
            <Button
              type="submit"
              icono={<Plus className="h-4 w-4" />}
              cargando={agregarMutation.isPending}
              className="sm:mt-7"
            >
              Agregar
            </Button>
          </form>
        </div>
      )}

      <Modal
        abierto={detalleEditando !== null}
        titulo={detalleEditando ? `Editar ${detalleEditando.producto.nombre}` : 'Editar producto'}
        onCerrar={cerrarEdicionLinea}
      >
        {detalleEditando && (
          <form
            onSubmit={editarForm.handleSubmit((values) => editarMutation.mutate(values))}
            className="flex flex-col gap-4"
            noValidate
          >
            {editarMutation.isError && (
              <Alert
                tipo="error"
                mensaje={mensajeError(editarMutation.error, 'No se pudo actualizar el producto')}
              />
            )}

            <Input
              label="Cantidad"
              type="number"
              min="1"
              error={editarForm.formState.errors.cantidad?.message}
              {...editarForm.register('cantidad', {
                required: 'Indica la cantidad',
                valueAsNumber: true,
                min: { value: 1, message: 'Mínimo 1' },
              })}
            />

            <Input
              label="Notas"
              placeholder="Ej. sin cebolla"
              ayuda="Opcional. Se envía a cocina con la comanda."
              error={editarForm.formState.errors.notas?.message}
              {...editarForm.register('notas')}
            />

            <FormActions
              enviar="Guardar"
              onCancelar={cerrarEdicionLinea}
              enviando={editarMutation.isPending}
            />
          </form>
        )}
      </Modal>

      <ConfirmDialog
        abierto={detalleEliminando !== null}
        titulo="Quitar producto"
        mensaje={`¿Seguro que deseas quitar "${detalleEliminando?.producto.nombre}" del pedido?`}
        confirmando={eliminarMutation.isPending}
        onConfirmar={() => eliminarMutation.mutate()}
        onCancelar={() => setDetalleEliminando(null)}
      />

      <ConfirmDialog
        abierto={confirmandoCierre}
        severidad="normal"
        titulo="Cerrar pedido"
        mensaje="El pedido dejará de aceptar cambios. ¿Deseas continuar?"
        confirmando={cerrarMutation.isPending}
        error={
          cerrarMutation.isError
            ? mensajeError(cerrarMutation.error, 'No se pudo cerrar el pedido')
            : undefined
        }
        onConfirmar={() => cerrarMutation.mutate()}
        onCancelar={() => setConfirmandoCierre(false)}
      />

      <ConfirmDialog
        abierto={confirmandoCancelacion}
        titulo="Cancelar pedido"
        mensaje="Se cancelará el pedido completo y la mesa quedará libre. ¿Deseas continuar?"
        confirmando={cancelarMutation.isPending}
        error={
          cancelarMutation.isError
            ? mensajeError(cancelarMutation.error, 'No se pudo cancelar el pedido')
            : undefined
        }
        onConfirmar={() => cancelarMutation.mutate()}
        onCancelar={() => setConfirmandoCancelacion(false)}
      />
    </div>
  );
}
