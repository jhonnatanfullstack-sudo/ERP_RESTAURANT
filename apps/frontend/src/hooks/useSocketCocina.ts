import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { getAccessToken } from '../services/api';

const URL_API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

/**
 * Conecta el único WebSocket en tiempo real de la sesión (ver `realtime/socket.ts` en el
 * backend) y mantiene la caché de TanStack Query al día apenas pasa algo — una comanda cambia
 * de estado, o se crea una notificación (comanda lista, pedido nuevo, reclamo nuevo)—, sin
 * esperar al próximo sondeo. El nombre quedó de cuando solo cubría cocina; ahora es el único
 * punto de conexión del socket para todo el panel, para no abrir una conexión por cada cosa que
 * quiera tiempo real. Se llama una sola vez en `AdminLayout`, que solo se monta con sesión
 * autenticada: al cerrar sesión se desmonta y el socket se cierra con él.
 *
 * El token se relee en cada intento de conexión (`auth` como función, no como objeto fijo) para
 * que una reconexión después de un refresh de token —o tras perder la red un rato— use el
 * vigente y no uno ya vencido.
 */
export function useSocketCocina(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = io(URL_API, {
      auth: (cb) => cb({ token: getAccessToken() }),
    });

    socket.on('cocina:comanda-actualizada', () => {
      queryClient.invalidateQueries({ queryKey: ['comandas'] });
      queryClient.invalidateQueries({ queryKey: ['pedidos'] });
    });

    socket.on('notificacion:nueva', () => {
      queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
      queryClient.invalidateQueries({ queryKey: ['notificaciones-no-leidas'] });
    });

    return () => {
      socket.disconnect();
    };
  }, [queryClient]);
}
