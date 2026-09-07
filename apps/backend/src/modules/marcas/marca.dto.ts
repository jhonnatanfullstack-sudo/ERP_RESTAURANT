import { z } from 'zod';

export const crearMarcaSchema = z.object({
  nombre: z.string().trim().min(1).max(100),
  descripcion: z.string().trim().max(255).nullable().optional(),
});

export const actualizarMarcaSchema = z.object({
  nombre: z.string().trim().min(1).max(100).optional(),
  descripcion: z.string().trim().max(255).nullable().optional(),
  activo: z.boolean().optional(),
});

export type CrearMarcaDto = z.infer<typeof crearMarcaSchema>;
export type ActualizarMarcaDto = z.infer<typeof actualizarMarcaSchema>;
