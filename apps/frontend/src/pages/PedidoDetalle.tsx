import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, CheckCircle2, Pencil, Plus, Send, Trash2, XCircle } from 'lucide-react';
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
import { Combobox } from '../components/ui/Combobox';
import type { OpcionCombobox } from '../components/ui/Combobox';
import { formatearFechaHora, formatearPrecio, nombreCliente } from '../utils/formato';
import type { AgregarDetalleInput } from '../services/pedidos.service';
import type { DetallePedido, EstadoComanda, EstadoPedido } from '../types/api';

const inputClass =
  'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none';

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

function mensajeError(error: unknown, fallback: string): string {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
  );
}

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
            <h1 className="text-2xl font-bold text-zinc-900">
              {pedido.mesa.salon.nombre} — Mesa {pedido.mesa.numero}
            </h1>
            <Badge tono={TONO_ESTADO[pedido.estado]}>{ETIQUETA_ESTADO[pedido.estado]}</Badge>
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

      {puedeEditar && seleccionados.size > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
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
      )}

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
            className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_100px_1fr_auto]"
          >
            <Controller
              control={agregarForm.control}
              name="productoId"
              rules={{ required: true }}
              render={({ field }) => (
                <Combobox
                  opciones={opcionesProductos}
                  valor={field.value}
                  onCambiar={field.onChange}
                  placeholder="Buscar producto…"
                  vacio="No se encontraron productos"
                />
              )}
            />
            <input
              type="number"
              min="1"
              placeholder="Cant."
              {...agregarForm.register('cantidad', { required: true, valueAsNumber: true })}
              className={inputClass}
            />
            <input
              placeholder="Notas (ej. sin cebolla)"
              {...agregarForm.register('notas')}
              className={inputClass}
            />
            <Button
              type="submit"
              icono={<Plus className="h-4 w-4" />}
              disabled={agregarMutation.isPending}
            >
              Agregar
            </Button>
          </form>
        </div>
      )}

      {detalleEditando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-bold text-zinc-900">
              Editar {detalleEditando.producto.nombre}
            </h2>
            <form
              onSubmit={editarForm.handleSubmit((values) => editarMutation.mutate(values))}
              className="flex flex-col gap-4"
            >
              {editarMutation.isError && (
                <Alert
                  tipo="error"
                  mensaje={mensajeError(editarMutation.error, 'No se pudo actualizar el producto')}
                />
              )}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">Cantidad</label>
                <input
                  type="number"
                  min="1"
                  {...editarForm.register('cantidad', { required: true, valueAsNumber: true })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">Notas</label>
                <input {...editarForm.register('notas')} className={inputClass} />
              </div>
              <div className="flex justify-end gap-3">
                <Button type="button" variante="secondary" onClick={() => setDetalleEditando(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={editarMutation.isPending}>
                  Guardar
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

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
