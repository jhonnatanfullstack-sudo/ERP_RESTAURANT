import { z } from 'zod';

export const crearSalonSchema = z.object({
  nombre: z.string().trim().min(1).max(100),
  descripcion: z.string().trim().max(255).nullable().optional(),
});

export const actualizarSalonSchema = z.object({
  nombre: z.string().trim().min(1).max(100).optional(),
  descripcion: z.string().trim().max(255).nullable().optional(),
  activo: z.boolean().optional(),
});

export type CrearSalonDto = z.infer<typeof crearSalonSchema>;
export type ActualizarSalonDto = z.infer<typeof actualizarSalonSchema>;
