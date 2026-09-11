import { z } from 'zod';

/** 4 caracteres alfanuméricos en mayúscula, formato SUNAT (B001, F001, FC01…). La letra
 * inicial se valida contra el tipo de comprobante en `talonario.service.ts`. */
const serieSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9]{3}$/, 'La serie debe tener 4 caracteres: una letra y 3 alfanuméricos');

const numeroCorrelativoSchema = z.coerce.number().int().min(1).max(99999999);

export const crearTalonarioSchema = z
  .object({
    empresaId: z.string().uuid(),
    tipoComprobanteId: z.string().uuid(),
    almacenId: z.string().uuid(),
    serie: serieSchema,
    numeroInicio: numeroCorrelativoSchema,
    numeroFin: numeroCorrelativoSchema,
    /** Último número ya emitido con esta serie (0 = talonario nuevo). */
    numeroActual: z.coerce.number().int().min(0).max(99999999).optional(),
    usuarioIds: z.array(z.string().uuid()).max(100).optional(),
  })
  .refine((data) => data.numeroFin >= data.numeroInicio, {
    message: 'El número final debe ser mayor o igual al número inicial',
    path: ['numeroFin'],
  });

export const actualizarTalonarioSchema = z
  .object({
    almacenId: z.string().uuid().optional(),
    serie: serieSchema.optional(),
    numeroInicio: numeroCorrelativoSchema.optional(),
    numeroFin: numeroCorrelativoSchema.optional(),
    numeroActual: z.coerce.number().int().min(0).max(99999999).optional(),
    activo: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.numeroInicio === undefined ||
      data.numeroFin === undefined ||
      data.numeroFin >= data.numeroInicio,
    {
      message: 'El número final debe ser mayor o igual al número inicial',
      path: ['numeroFin'],
    },
  );

export const asignarUsuariosSchema = z.object({
  usuarioIds: z.array(z.string().uuid()).max(100),
});

export type CrearTalonarioDto = z.infer<typeof crearTalonarioSchema>;
export type ActualizarTalonarioDto = z.infer<typeof actualizarTalonarioSchema>;
export type AsignarUsuariosDto = z.infer<typeof asignarUsuariosSchema>;
