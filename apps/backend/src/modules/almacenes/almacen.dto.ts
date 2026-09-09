import { z } from 'zod';

export const crearAlmacenSchema = z.object({
  empresaId: z.string().uuid(),
  nombre: z.string().trim().min(1).max(100),
  direccion: z.string().trim().max(255).nullable().optional(),
  esPrincipal: z.boolean().optional(),
});

export const actualizarAlmacenSchema = z.object({
  nombre: z.string().trim().min(1).max(100).optional(),
  direccion: z.string().trim().max(255).nullable().optional(),
  esPrincipal: z.boolean().optional(),
  activo: z.boolean().optional(),
});

export type CrearAlmacenDto = z.infer<typeof crearAlmacenSchema>;
export type ActualizarAlmacenDto = z.infer<typeof actualizarAlmacenSchema>;
