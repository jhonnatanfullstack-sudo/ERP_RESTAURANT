import { z } from 'zod';
import { EstadoComanda } from './comanda.entity';

export const crearComandaSchema = z.object({
  pedidoId: z.string().uuid(),
  detalleIds: z.array(z.string().uuid()).min(1, 'Selecciona al menos un producto'),
  notas: z.string().trim().max(255).nullable().optional(),
});

export const actualizarEstadoComandaSchema = z.object({
  estado: z.enum(EstadoComanda),
});

export type CrearComandaDto = z.infer<typeof crearComandaSchema>;
export type ActualizarEstadoComandaDto = z.infer<typeof actualizarEstadoComandaSchema>;
