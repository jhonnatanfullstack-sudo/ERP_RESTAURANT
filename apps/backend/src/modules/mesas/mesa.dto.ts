import { z } from 'zod';

export const crearMesaSchema = z.object({
  salonId: z.string().uuid(),
  numero: z.string().trim().min(1).max(20),
  capacidad: z.coerce.number().int().positive().max(100),
});

export const actualizarMesaSchema = z.object({
  salonId: z.string().uuid().optional(),
  numero: z.string().trim().min(1).max(20).optional(),
  capacidad: z.coerce.number().int().positive().max(100).optional(),
  activo: z.boolean().optional(),
});

export type CrearMesaDto = z.infer<typeof crearMesaSchema>;
export type ActualizarMesaDto = z.infer<typeof actualizarMesaSchema>;
