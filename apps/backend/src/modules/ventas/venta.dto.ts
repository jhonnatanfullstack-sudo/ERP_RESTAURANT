import { z } from 'zod';
import { FormaPago } from './venta.entity';

export const crearVentaSchema = z.object({
  pedidoId: z.string().uuid(),
  tipoComprobanteId: z.string().uuid(),
  clienteId: z.string().uuid().optional(),
  tipoOperacionId: z.string().uuid().optional(),
  formaPago: z.enum(FormaPago).optional(),
  medioPagoId: z.string().uuid().optional(),
});

export type CrearVentaDto = z.infer<typeof crearVentaSchema>;
