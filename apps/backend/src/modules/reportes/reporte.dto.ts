import { z } from 'zod';

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato YYYY-MM-DD');

/**
 * Rango de fechas de un reporte, en días completos de calendario local (no instantes UTC):
 * `desde` y `hasta` son inclusivos, así que "2026-09-01 a 2026-09-01" es un solo día entero.
 */
export const rangoReporteSchema = z
  .object({
    desde: fecha,
    hasta: fecha,
  })
  .refine((datos) => datos.desde <= datos.hasta, {
    message: 'La fecha inicial no puede ser posterior a la final',
    path: ['desde'],
  });

export type RangoReporteDto = z.infer<typeof rangoReporteSchema>;
