import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, ChefHat, MessageSquareWarning, ShoppingBag } from 'lucide-react';
import * as notificacionesService from '../services/notificaciones.service';
import { useAuth } from '../context/AuthContext';
import { formatearHora } from '../utils/formato';
import type { Notificacion, TipoNotificacion } from '../types/api';

const ICONO_TIPO: Record<TipoNotificacion, typeof ChefHat> = {
  comanda_lista: ChefHat,
  pedido_nuevo: ShoppingBag,
  reclamo_nuevo: MessageSquareWarning,
};

/** A dónde llevar al hacer clic — `cocina`/`reclamaciones` no tienen una vista de detalle por
 * id todavía, así que solo se navega a la lista; `pedido` sí. */
function rutaDeNotificacion(n: Notificacion): string | null {
  if (n.entidadTipo === 'pedido' && n.entidadId) return `/pedidos/${n.entidadId}`;
  if (n.entidadTipo === 'comanda') return '/cocina';
  if (n.entidadTipo === 'reclamacion') return '/reclamaciones';
  return null;
}

export function NotificacionesBell() {
  const { tienePermiso } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [abierto, setAbierto] = useState(false);

  const puedeVer = tienePermiso('notificaciones.ver');

  const noLeidasQuery = useQuery({
    queryKey: ['notificaciones-no-leidas'],
    queryFn: notificacionesService.contarNoLeidas,
    enabled: puedeVer,
  });
  const listaQuery = useQuery({
    queryKey: ['notificaciones'],
    queryFn: notificacionesService.listarNotificaciones,
    enabled: puedeVer && abierto,
  });

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
    queryClient.invalidateQueries({ queryKey: ['notificaciones-no-leidas'] });
  }

  const marcarLeidaMutation = useMutation({
    mutationFn: notificacionesService.marcarLeida,
    onSuccess: invalidar,
  });
  const marcarTodasMutation = useMutation({
    mutationFn: notificacionesService.marcarTodasLeidas,
    onSuccess: invalidar,
  });

  if (!puedeVer) return null;

  const noLeidas = noLeidasQuery.data ?? 0;
  const notificaciones = listaQuery.data ?? [];

  function alClicNotificacion(n: Notificacion) {
    if (!n.leida) marcarLeidaMutation.mutate(n.id);
    setAbierto(false);
    const ruta = rutaDeNotificacion(n);
    if (ruta) navigate(ruta);
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Notificaciones"
        onClick={() => setAbierto((v) => !v)}
        className="relative z-20 rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
      >
        <Bell className="h-5 w-5" />
        {noLeidas > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-600 px-1 text-[10px] font-bold text-white">
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <>
          <button
            type="button"
            aria-label="Cerrar notificaciones"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setAbierto(false)}
          />
          <div className="animate-scale-in absolute right-0 z-20 mt-2 w-80 rounded-lg border border-zinc-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-zinc-100 px-3.5 py-2.5">
              <span className="text-sm font-semibold text-zinc-900">Notificaciones</span>
              {noLeidas > 0 && (
                <button
                  type="button"
                  onClick={() => marcarTodasMutation.mutate()}
                  className="text-xs font-medium text-orange-600 hover:text-orange-700"
                >
                  Marcar todas leídas
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {notificaciones.length === 0 ? (
                <p className="px-3.5 py-6 text-center text-sm text-zinc-400">
                  {listaQuery.isLoading ? 'Cargando…' : 'No hay notificaciones'}
                </p>
              ) : (
                notificaciones.map((n) => {
                  const Icono = ICONO_TIPO[n.tipo];
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => alClicNotificacion(n)}
                      className={`flex w-full items-start gap-2.5 border-b border-zinc-50 px-3.5 py-3 text-left hover:bg-zinc-50 ${
                        n.leida ? '' : 'bg-orange-50/50'
                      }`}
                    >
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
                        <Icono className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-zinc-900">
                            {n.titulo}
                          </span>
                          {!n.leida && (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-600" />
                          )}
                        </span>
                        <span className="block truncate text-xs text-zinc-500">{n.mensaje}</span>
                        <span className="block text-[11px] text-zinc-400">
                          {formatearHora(n.creadoEn)}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
