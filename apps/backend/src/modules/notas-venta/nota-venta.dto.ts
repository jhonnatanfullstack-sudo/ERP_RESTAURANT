import { z } from 'zod';

/** Nota de Crédito: siempre corrige el 100% de la venta indicada (anulación, devolución total,
 * error de RUC, etc.) — clona automáticamente todas sus líneas. Una nota parcial por ítem queda
 * fuera del alcance de esta primera versión (ver `docs/decisiones-tecnicas.md`). */
export const crearNotaCreditoSchema = z.object({
  ventaId: z.string().uuid(),
  talonarioId: z.string().uuid(),
  motivoId: z.string().uuid(),
  descripcionSustento: z.string().trim().max(255).optional(),
});

/** Nota de Débito: un cargo adicional sobre una venta ya emitida (interés moratorio,
 * penalidad…), como una línea nueva y libre — no clona nada de la venta original. */
export const crearNotaDebitoSchema = z.object({
  ventaId: z.string().uuid(),
  talonarioId: z.string().uuid(),
  motivoId: z.string().uuid(),
  descripcionSustento: z.string().trim().max(255).optional(),
  concepto: z.string().trim().min(3).max(150),
  monto: z.coerce.number().positive(),
});

export type CrearNotaCreditoDto = z.infer<typeof crearNotaCreditoSchema>;
export type CrearNotaDebitoDto = z.infer<typeof crearNotaDebitoSchema>;
