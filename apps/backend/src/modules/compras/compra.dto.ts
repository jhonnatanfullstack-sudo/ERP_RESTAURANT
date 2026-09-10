import { z } from 'zod';

/** Una línea de compra: exactamente un insumo o un producto (mercadería), nunca ambos. */
const lineaCompraSchema = z
  .object({
    insumoId: z.string().uuid().optional(),
    productoId: z.string().uuid().optional(),
    cantidad: z.coerce.number().positive(),
    costoUnitario: z.coerce.number().positive(),
  })
  .refine((data) => Boolean(data.insumoId) !== Boolean(data.productoId), {
    message: 'Indica un insumo o un producto (mercadería), no ambos ni ninguno',
    path: ['insumoId'],
  });

export const crearCompraSchema = z.object({
  proveedorId: z.string().uuid(),
  almacenId: z.string().uuid(),
  tipoComprobanteId: z.string().uuid().optional(),
  serie: z.string().trim().max(20).optional(),
  numero: z.string().trim().max(20).optional(),
  /** Fecha del comprobante del proveedor, formato 'YYYY-MM-DD'. Si no se envía, se usa hoy. */
  fechaEmision: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato YYYY-MM-DD')
    .optional(),
  /** Si el `costoUnitario` de cada línea ya incluye IGV o no — ver `Compra.incluyeIgv`. */
  incluyeIgv: z.boolean().default(true),
  observacion: z.string().trim().max(255).optional(),
  lineas: z.array(lineaCompraSchema).min(1).max(50),
});

export type LineaCompraDto = z.infer<typeof lineaCompraSchema>;
export type CrearCompraDto = z.infer<typeof crearCompraSchema>;
