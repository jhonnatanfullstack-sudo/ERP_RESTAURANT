import { z } from 'zod';

export const abrirCajaSchema = z.object({
  montoApertura: z.coerce.number().nonnegative(),
  observacion: z.string().trim().max(255).optional(),
});

export const cerrarCajaSchema = z.object({
  montoDeclarado: z.coerce.number().nonnegative(),
  observacion: z.string().trim().max(255).optional(),
});

export const registrarMovimientoSchema = z.object({
  tipo: z.enum(['ingreso', 'egreso']),
  monto: z.coerce.number().positive(),
  concepto: z.string().trim().min(3).max(255),
});

export type AbrirCajaDto = z.infer<typeof abrirCajaSchema>;
export type CerrarCajaDto = z.infer<typeof cerrarCajaSchema>;
export type RegistrarMovimientoDto = z.infer<typeof registrarMovimientoSchema>;
