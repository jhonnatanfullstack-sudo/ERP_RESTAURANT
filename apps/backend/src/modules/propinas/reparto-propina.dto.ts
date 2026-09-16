import { z } from 'zod';
import { MetodoRepartoPropina } from './reparto-propina.entity';

/** Vista previa: mismo cálculo que el reparto real, pero sin guardar nada — deja al usuario
 * revisar los montos antes de confirmarlos. */
export const vistaPreviaRepartoSchema = z
  .object({
    fechaDesde: z.coerce.date(),
    fechaHasta: z.coerce.date(),
    metodo: z.enum(MetodoRepartoPropina),
  })
  .refine((datos) => datos.fechaHasta > datos.fechaDesde, {
    message: 'La fecha final debe ser posterior a la inicial',
    path: ['fechaHasta'],
  });

export const crearRepartoSchema = z
  .object({
    fechaDesde: z.coerce.date(),
    fechaHasta: z.coerce.date(),
    metodo: z.enum(MetodoRepartoPropina),
    observacion: z.string().trim().max(255).optional(),
  })
  .refine((datos) => datos.fechaHasta > datos.fechaDesde, {
    message: 'La fecha final debe ser posterior a la inicial',
    path: ['fechaHasta'],
  });

export type VistaPreviaRepartoDto = z.infer<typeof vistaPreviaRepartoSchema>;
export type CrearRepartoDto = z.infer<typeof crearRepartoSchema>;
