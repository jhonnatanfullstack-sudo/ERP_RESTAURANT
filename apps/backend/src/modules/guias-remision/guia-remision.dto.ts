import { z } from 'zod';

const detalleGuiaRemisionSchema = z.object({
  descripcion: z.string().trim().min(1).max(150),
  cantidad: z.coerce.number().positive(),
  unidadMedidaId: z.string().uuid(),
});

const UBIGEO = /^\d{6}$/;

export const crearGuiaRemisionSchema = z.object({
  /** Talonario de serie `09` a usar. Si el usuario tiene exactamente uno asignado se resuelve
   * solo, igual que en Ventas — ver `resolverTalonarioParaGuiaRemision`. */
  talonarioId: z.string().uuid().optional(),
  /** Venta que acompaña el traslado (ej. reparto a un cliente con RUC). Opcional: la mayoría
   * de traslados de un restaurante no nace de una venta. */
  ventaId: z.string().uuid().optional(),
  motivoTrasladoId: z.string().uuid(),
  modalidadTrasladoId: z.string().uuid(),
  fechaTraslado: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato YYYY-MM-DD'),
  pesoTotalKg: z.coerce.number().positive(),
  numeroBultos: z.coerce.number().int().positive().optional(),
  partidaDireccion: z.string().trim().min(1).max(255),
  partidaUbigeo: z.string().regex(UBIGEO, 'El ubigeo debe tener 6 dígitos').optional(),
  llegadaDireccion: z.string().trim().min(1).max(255),
  llegadaUbigeo: z.string().regex(UBIGEO, 'El ubigeo debe tener 6 dígitos').optional(),
  destinatarioNumeroDocumento: z.string().trim().max(15).optional(),
  destinatarioNombre: z.string().trim().max(150).optional(),
  /** Transporte privado: vehículo propio. */
  transportistaPlaca: z.string().trim().max(8).optional(),
  transportistaLicencia: z.string().trim().max(20).optional(),
  /** Transporte público: la empresa de transporte. */
  transportistaRuc: z.string().trim().max(11).optional(),
  transportistaRazonSocial: z.string().trim().max(150).optional(),
  observacion: z.string().trim().max(255).optional(),
  detalles: z.array(detalleGuiaRemisionSchema).min(1).max(50),
});

export type DetalleGuiaRemisionDto = z.infer<typeof detalleGuiaRemisionSchema>;
export type CrearGuiaRemisionDto = z.infer<typeof crearGuiaRemisionSchema>;
