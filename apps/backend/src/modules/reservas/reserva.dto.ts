import { z } from 'zod';
import { EstadoReserva } from './reserva.entity';

export const crearReservaSchema = z.object({
  clienteId: z.string().uuid(),
  mesaId: z.string().uuid(),
  fechaHora: z.string().datetime({ offset: true }),
  duracionMinutos: z.coerce.number().int().positive().max(600).optional(),
  cantidadPersonas: z.coerce.number().int().positive().max(100),
  notas: z.string().trim().max(255).nullable().optional(),
});

export const actualizarReservaSchema = z.object({
  clienteId: z.string().uuid().optional(),
  mesaId: z.string().uuid().optional(),
  fechaHora: z.string().datetime({ offset: true }).optional(),
  duracionMinutos: z.coerce.number().int().positive().max(600).optional(),
  cantidadPersonas: z.coerce.number().int().positive().max(100).optional(),
  estado: z.enum(EstadoReserva).optional(),
  notas: z.string().trim().max(255).nullable().optional(),
});

export type CrearReservaDto = z.infer<typeof crearReservaSchema>;
export type ActualizarReservaDto = z.infer<typeof actualizarReservaSchema>;
