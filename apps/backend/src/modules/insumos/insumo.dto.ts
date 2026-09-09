import { z } from 'zod';

export const crearInsumoSchema = z.object({
  nombre: z.string().trim().min(1).max(150),
  descripcion: z.string().trim().max(500).nullable().optional(),
  unidadMedidaId: z.string().uuid(),
});

export const actualizarInsumoSchema = z.object({
  nombre: z.string().trim().min(1).max(150).optional(),
  descripcion: z.string().trim().max(500).nullable().optional(),
  unidadMedidaId: z.string().uuid().optional(),
  activo: z.boolean().optional(),
});

export type CrearInsumoDto = z.infer<typeof crearInsumoSchema>;
export type ActualizarInsumoDto = z.infer<typeof actualizarInsumoSchema>;
