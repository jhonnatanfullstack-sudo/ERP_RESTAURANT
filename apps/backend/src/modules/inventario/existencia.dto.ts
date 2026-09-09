import { z } from 'zod';

/** Movimientos que se registran a mano desde el frontend — `inicial`/`compra`/`ajuste_entrada`
 * suman stock, `ajuste_salida` resta. `consumo_cocina`/`venta_directa` los dispara el propio
 * flujo de Comandas/Ventas (`existencia.service.ts`), nunca este endpoint. */
export const registrarMovimientoSchema = z
  .object({
    almacenId: z.string().uuid(),
    insumoId: z.string().uuid().optional(),
    productoId: z.string().uuid().optional(),
    tipo: z.enum(['inicial', 'compra', 'ajuste_entrada', 'ajuste_salida']),
    cantidad: z.coerce.number().positive(),
    costoUnitario: z.coerce.number().nonnegative().optional(),
    observacion: z.string().trim().max(255).optional(),
  })
  .refine((data) => Boolean(data.insumoId) !== Boolean(data.productoId), {
    message: 'Indica un insumo o un producto (mercadería), no ambos ni ninguno',
    path: ['insumoId'],
  });

export type RegistrarMovimientoExistenciaDto = z.infer<typeof registrarMovimientoSchema>;
