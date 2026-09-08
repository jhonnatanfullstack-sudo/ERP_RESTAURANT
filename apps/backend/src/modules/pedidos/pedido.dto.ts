import { z } from 'zod';
import { EstadoPedido } from './pedido.entity';

export const crearPedidoSchema = z.object({
  mesaId: z.string().uuid(),
  notas: z.string().trim().max(255).nullable().optional(),
});

export const actualizarPedidoSchema = z.object({
  estado: z.enum(EstadoPedido).optional(),
  notas: z.string().trim().max(255).nullable().optional(),
});

export const agregarDetalleSchema = z.object({
  productoId: z.string().uuid(),
  cantidad: z.coerce.number().int().positive().max(999),
  notas: z.string().trim().max(255).nullable().optional(),
});

export const actualizarDetalleSchema = z.object({
  cantidad: z.coerce.number().int().positive().max(999).optional(),
  notas: z.string().trim().max(255).nullable().optional(),
});

export type CrearPedidoDto = z.infer<typeof crearPedidoSchema>;
export type ActualizarPedidoDto = z.infer<typeof actualizarPedidoSchema>;
export type AgregarDetalleDto = z.infer<typeof agregarDetalleSchema>;
export type ActualizarDetalleDto = z.infer<typeof actualizarDetalleSchema>;
