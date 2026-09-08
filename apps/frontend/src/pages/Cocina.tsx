import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChefHat, Flame, Utensils, XCircle } from 'lucide-react';
import * as comandasService from '../services/comandas.service';
import { useAuth } from '../context/AuthContext';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { formatearFechaHora } from '../utils/formato';
import type { Comanda, EstadoComanda } from '../types/api';

const ETIQUETA_ESTADO: Record<EstadoComanda, string> = {
  pendiente: 'En cola',
  en_preparacion: 'Preparando',
  listo: 'Listo',
  entregado: 'Entregado',
  cancelada: 'Cancelada',
};

const TONO_ESTADO: Record<EstadoComanda, 'exito' | 'neutral' | 'peligro'> = {
  pendiente: 'neutral',
  en_preparacion: 'neutral',
  listo: 'exito',
  entregado: 'neutral',
  cancelada: 'peligro',
};

const ACCION_SIGUIENTE: Partial<
  Record<EstadoComanda, { estado: EstadoComanda; etiqueta: string }>
> = {
  pendiente: { estado: 'en_preparacion', etiqueta: 'Empezar a preparar' },
  en_preparacion: { estado: 'listo', etiqueta: 'Marcar listo' },
  listo: { estado: 'entregado', etiqueta: 'Entregar' },
};

type Filtro = 'activas' | 'todas';

export function Cocina() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState<Filtro>('activas');
  const [comandaCancelando, setComandaCancelando] = useState<Comanda | null>(null);

  const comandasQuery = useQuery({
    queryKey: ['comandas'],
    queryFn: comandasService.listarComandas,
    refetchInterval: 8000,
  });

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['comandas'] });
    queryClient.invalidateQueries({ queryKey: ['pedidos'] });
  }

  const avanzarMutation = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: EstadoComanda }) =>
      comandasService.actualizarEstadoComanda(id, estado),
    onSuccess: invalidar,
  });

  const cancelarMutation = useMutation({
    mutationFn: () => comandasService.cancelarComanda(comandaCancelando!.id),
    onSuccess: () => {
      invalidar();
      setComandaCancelando(null);
    },
  });

  if (comandasQuery.isLoading) return <Spinner />;

  const comandas = comandasQuery.data ?? [];
  const comandasVisibles =
    filtro === 'activas'
      ? comandas.filter((c) => c.estado !== 'entregado' && c.estado !== 'cancelada')
      : comandas;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Cocina</h1>
          <p className="mt-1 text-sm text-zinc-500">Comandas enviadas desde las mesas</p>
        </div>
        <div className="flex gap-2">
          {(['activas', 'todas'] as const).map((valor) => (
            <button
              key={valor}
              type="button"
              onClick={() => setFiltro(valor)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                filtro === valor
                  ? 'bg-orange-600 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {valor === 'activas' ? 'Activas' : 'Todas'}
            </button>
          ))}
        </div>
      </div>

      {comandasVisibles.length === 0 ? (
        <EmptyState icono={ChefHat} titulo="No hay comandas para mostrar" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {comandasVisibles.map((comanda) => {
            const accion = ACCION_SIGUIENTE[comanda.estado];
            return (
              <div
                key={comanda.id}
                className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-zinc-900">
                      {comanda.pedido.mesa.salon.nombre} — Mesa {comanda.pedido.mesa.numero}
                    </p>
                    <p className="text-xs text-zinc-500">{formatearFechaHora(comanda.creadoEn)}</p>
                  </div>
                  <Badge tono={TONO_ESTADO[comanda.estado]}>
                    {ETIQUETA_ESTADO[comanda.estado]}
                  </Badge>
                </div>

                <ul className="flex flex-col gap-1.5 border-t border-zinc-100 pt-3">
                  {comanda.detalles.map((detalle) => (
                    <li key={detalle.id} className="flex items-start gap-2 text-sm">
                      <Utensils className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
                      <span>
                        <span className="font-semibold text-zinc-900">{detalle.cantidad}×</span>{' '}
                        {detalle.producto.nombre}
                        {detalle.notas && (
                          <span className="block text-xs text-zinc-500">{detalle.notas}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>

                {(accion ||
                  (comanda.estado === 'pendiente' && tienePermiso('cocina.eliminar'))) && (
                  <div className="mt-1 flex items-center gap-2 border-t border-zinc-100 pt-3">
                    {accion && tienePermiso('cocina.editar') && (
                      <Button
                        icono={
                          accion.estado === 'entregado' ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <Flame className="h-4 w-4" />
                          )
                        }
                        onClick={() =>
                          avanzarMutation.mutate({ id: comanda.id, estado: accion.estado })
                        }
                        disabled={avanzarMutation.isPending}
                        className="flex-1"
                      >
                        {accion.etiqueta}
                      </Button>
                    )}
                    {comanda.estado === 'pendiente' && tienePermiso('cocina.eliminar') && (
                      <Button
                        variante="secondary"
                        icono={<XCircle className="h-4 w-4" />}
                        onClick={() => setComandaCancelando(comanda)}
                      >
                        Cancelar
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        abierto={comandaCancelando !== null}
        titulo="Cancelar comanda"
        mensaje="Los productos volverán a estar disponibles para editar o enviar de nuevo en el pedido. ¿Deseas continuar?"
        confirmando={cancelarMutation.isPending}
        onConfirmar={() => cancelarMutation.mutate()}
        onCancelar={() => setComandaCancelando(null)}
      />
    </div>
  );
}
