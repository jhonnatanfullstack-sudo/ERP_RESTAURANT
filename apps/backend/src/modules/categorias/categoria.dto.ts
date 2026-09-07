import { z } from 'zod';

export const crearCategoriaSchema = z.object({
  nombre: z.string().trim().min(1).max(100),
  descripcion: z.string().trim().max(255).nullable().optional(),
});

export const actualizarCategoriaSchema = z.object({
  nombre: z.string().trim().min(1).max(100).optional(),
  descripcion: z.string().trim().max(255).nullable().optional(),
  activo: z.boolean().optional(),
});

export type CrearCategoriaDto = z.infer<typeof crearCategoriaSchema>;
export type ActualizarCategoriaDto = z.infer<typeof actualizarCategoriaSchema>;
