import { z } from 'zod';

/** Fecha sin hora, en el formato `YYYY-MM-DD` que guarda una columna `date` de Postgres. */
const fechaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato YYYY-MM-DD');

const montoSchema = z.coerce.number().positive().max(9999999.99);

export const registrarPagoSchema = z.object({
  fechaPago: fechaSchema,
  monto: montoSchema,
  medioPagoId: z.string().uuid(),
  /** Obligatorios si el medio de pago es bancarizado — se valida en el servicio, que es quien
   * sabe si ese medio lo exige (`MedioPago.requiereBanco`). */
  bancoId: z.string().uuid().optional(),
  numeroOperacion: z.string().trim().min(1).max(50).optional(),
  observacion: z.string().trim().max(255).optional(),
});

export const anularPagoSchema = z.object({
  motivo: z.string().trim().min(1).max(255),
});

export type RegistrarPagoDto = z.infer<typeof registrarPagoSchema>;
export type AnularPagoDto = z.infer<typeof anularPagoSchema>;
