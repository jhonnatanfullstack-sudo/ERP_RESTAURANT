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
    /** Serie desde la que se numera el comprobante. Opcional: si el usuario tiene un solo
     * talonario para ese comprobante se resuelve solo, y si no tiene ninguno se cae a la
     * numeración anterior al módulo (ver `venta.service.ts: crearVenta`). */
    talonarioId: z.string().uuid().optional(),
    clienteId: z.string().uuid().optional(),
    tipoOperacionId: z.string().uuid().optional(),
    formaPago: z.enum(FormaPago).optional(),
    medioPagoId: z.string().uuid().optional(),
    /** Sustento bancario del cobro al contado, obligatorio si el medio de pago lo exige
     * (`MedioPago.requiereBanco`) — se valida en el servicio. */
    bancoId: z.string().uuid().optional(),
    numeroOperacion: z.string().trim().min(1).max(50).optional(),
    /** Venta al crédito: vencimiento de la primera cuota y en cuántas se pactó. SUNAT exige
     * el cronograma en el comprobante (RS 193-2020); si no se envía, se asume una sola cuota
     * a 30 días. */
    fechaPrimerVencimiento: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato YYYY-MM-DD')
      .optional(),
    numeroCuotas: z.coerce.number().int().min(1).max(36).optional(),
    /** Propina voluntaria — no paga IGV, se suma al monto a cobrar por fuera del comprobante. */
    propina: z.coerce.number().min(0).max(9999.99).optional(),
  })
  .refine((data) => Boolean(data.pedidoId) !== Boolean(data.detalles?.length), {
    message: 'Indica un pedido cerrado a facturar o una lista de productos, no ambos',
    path: ['pedidoId'],
  });

export type LineaVentaDto = z.infer<typeof lineaVentaSchema>;
export type CrearVentaDto = z.infer<typeof crearVentaSchema>;
