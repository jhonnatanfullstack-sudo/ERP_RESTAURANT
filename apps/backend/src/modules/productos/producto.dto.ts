import { z } from 'zod';

export const crearProductoSchema = z.object({
  categoriaId: z.string().uuid(),
  marcaId: z.string().uuid().nullable().optional(),
  unidadMedidaId: z.string().uuid(),
  nombre: z.string().trim().min(1).max(150),
  descripcion: z.string().trim().max(500).nullable().optional(),
  precio: z.coerce.number().positive().max(99999.99),
});

export const actualizarProductoSchema = z.object({
  categoriaId: z.string().uuid().optional(),
  marcaId: z.string().uuid().nullable().optional(),
  unidadMedidaId: z.string().uuid().optional(),
  nombre: z.string().trim().min(1).max(150).optional(),
  descripcion: z.string().trim().max(500).nullable().optional(),
  precio: z.coerce.number().positive().max(99999.99).optional(),
  activo: z.boolean().optional(),
});

export type CrearProductoDto = z.infer<typeof crearProductoSchema>;
export type ActualizarProductoDto = z.infer<typeof actualizarProductoSchema>;
