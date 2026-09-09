import { z } from 'zod';
import { FormaPago } from './venta.entity';

/** Línea de una venta directa (sin pedido de origen) — mismo shape que agregarDetalleSchema
 * de Pedidos, sin notas (detalle_ventas no las tiene: es un snapshot fiscal, no una comanda). */
const lineaVentaSchema = z.object({
  productoId: z.string().uuid(),
  cantidad: z.coerce.number().int().positive().max(999),
});

export const crearVentaSchema = z
  .object({
    // Exactamente una de las dos: un pedido cerrado a facturar, o la lista de productos
    // de una venta directa. Ver el .refine() de abajo.
    pedidoId: z.string().uuid().optional(),
    detalles: z.array(lineaVentaSchema).min(1).max(50).optional(),
    tipoComprobanteId: z.string().uuid(),
    clienteId: z.string().uuid().optional(),
    tipoOperacionId: z.string().uuid().optional(),
    formaPago: z.enum(FormaPago).optional(),
    medioPagoId: z.string().uuid().optional(),
  })
  .refine((data) => Boolean(data.pedidoId) !== Boolean(data.detalles?.length), {
    message: 'Indica un pedido cerrado a facturar o una lista de productos, no ambos',
    path: ['pedidoId'],
  });

export type LineaVentaDto = z.infer<typeof lineaVentaSchema>;
export type CrearVentaDto = z.infer<typeof crearVentaSchema>;
