import { z } from 'zod';

/** Una línea de receta: qué insumo y cuánto consume una unidad de un producto tipo
 * `servicio`. Fuente única — también la usa `productos/producto.dto.ts` al crear/editar un
 * producto con su receta inline, para no duplicar el schema. */
export const lineaRecetaSchema = z.object({
  insumoId: z.string().uuid(),
  cantidad: z.coerce.number().positive(),
});

export const reemplazarRecetaSchema = z.object({
  lineas: z.array(lineaRecetaSchema).max(50),
});

export type LineaRecetaDto = z.infer<typeof lineaRecetaSchema>;
export type ReemplazarRecetaDto = z.infer<typeof reemplazarRecetaSchema>;
