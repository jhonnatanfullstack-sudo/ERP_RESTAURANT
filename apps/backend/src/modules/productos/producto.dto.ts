import { z } from 'zod';
import { TipoProducto } from './producto.entity';
import { lineaRecetaSchema } from '../recetas/receta.dto';

export const crearProductoSchema = z.object({
  categoriaId: z.string().uuid(),
  marcaId: z.string().uuid().nullable().optional(),
  unidadMedidaId: z.string().uuid(),
  tipoAfectacionIgvId: z.string().uuid(),
  tipo: z.enum(TipoProducto).optional(),
  nombre: z.string().trim().min(1).max(150),
  descripcion: z.string().trim().max(500).nullable().optional(),
  precio: z.coerce.number().positive().max(99999.99),
  // Solo tiene sentido si `tipo = servicio`; se ignora para `mercaderia` (ver producto.service.ts).
  receta: z.array(lineaRecetaSchema).max(50).optional(),
});

export const actualizarProductoSchema = z.object({
  categoriaId: z.string().uuid().optional(),
  marcaId: z.string().uuid().nullable().optional(),
  unidadMedidaId: z.string().uuid().optional(),
  tipoAfectacionIgvId: z.string().uuid().optional(),
  tipo: z.enum(TipoProducto).optional(),
  nombre: z.string().trim().min(1).max(150).optional(),
  descripcion: z.string().trim().max(500).nullable().optional(),
  precio: z.coerce.number().positive().max(99999.99).optional(),
  activo: z.boolean().optional(),
  receta: z.array(lineaRecetaSchema).max(50).optional(),
});

export type CrearProductoDto = z.infer<typeof crearProductoSchema>;
export type ActualizarProductoDto = z.infer<typeof actualizarProductoSchema>;
