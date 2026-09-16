import type { Mesa, Pedido, Reserva } from '../types/api';

export type EstadoOcupacionMesa = 'libre' | 'ocupada' | 'reservada' | 'inactiva';

export interface OcupacionMesa {
  estado: EstadoOcupacionMesa;
  pedido?: Pedido;
  reserva?: Reserva;
}

/** Reserva activa de una mesa en este instante (pendiente/confirmada, dentro de su ventana de
 * horario). Antes vivía duplicado en `Mesas.tsx` y `Pedidos.tsx` con el mismo criterio exacto. */
export function reservaActivaDeMesa(mesaId: string, reservas: Reserva[]): Reserva | undefined {
  const ahora = Date.now();
  return reservas.find((r) => {
    if (r.mesa.id !== mesaId) return false;
    if (r.estado !== 'pendiente' && r.estado !== 'confirmada') return false;
    const inicio = new Date(r.fechaHora).getTime();
    const fin = inicio + r.duracionMinutos * 60_000;
    return ahora >= inicio && ahora < fin;
  });
}

/** Estado visual de una mesa, en orden de prioridad: inactiva > ocupada (pedido abierto) >
 * reservada > libre. */
export function calcularOcupacionMesa(
  mesa: Mesa,
  pedidos: Pedido[],
  reservas: Reserva[],
): OcupacionMesa {
  if (!mesa.activo) return { estado: 'inactiva' };

  const pedido = pedidos.find((p) => p.mesa?.id === mesa.id && p.estado === 'abierto');
  if (pedido) return { estado: 'ocupada', pedido };

  const reserva = reservaActivaDeMesa(mesa.id, reservas);
  if (reserva) return { estado: 'reservada', reserva };

  return { estado: 'libre' };
}

/** Minutos transcurridos desde una fecha ISO — cuánto lleva ocupada una mesa. */
export function minutosDesde(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
}
