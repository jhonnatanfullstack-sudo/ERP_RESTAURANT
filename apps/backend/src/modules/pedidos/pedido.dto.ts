import { z } from 'zod';
import { CanalOrigenPedido, EstadoPedido, MedioPagoPreferido } from './pedido.entity';

const lineaPedidoPublicoSchema = z.object({
  productoId: z.string().uuid(),
  cantidad: z.coerce.number().int().positive().max(999),
  notas: z.string().trim().max(255).optional(),
});

/** Pedido que arma el propio cliente desde la carta pública, sin autenticarse — ver
 * `carta-publica.controller.ts`. `SALON` queda afuera a propósito: ese lo abre un mesero
 * autenticado con `crearPedidoSchema`, nunca el visitante de la carta. */
export const crearPedidoPublicoSchema = z
  .object({
    canalOrigen: z.enum([
      CanalOrigenPedido.AUTOPEDIDO,
      CanalOrigenPedido.DELIVERY,
      CanalOrigenPedido.RECOJO,
    ]),
    mesaId: z.string().uuid().optional(),
    contactoNombre: z.string().trim().max(100).optional(),
    contactoTelefono: z.string().trim().max(20).optional(),
    direccionEntrega: z.string().trim().max(255).optional(),
    medioPagoPreferido: z.enum(MedioPagoPreferido).optional(),
    vueltoPara: z.coerce.number().positive().max(9999).optional(),
    notas: z.string().trim().max(255).optional(),
    detalles: z.array(lineaPedidoPublicoSchema).min(1).max(50),
  })
  .refine((data) => data.canalOrigen !== CanalOrigenPedido.AUTOPEDIDO || Boolean(data.mesaId), {
    message: 'Un autopedido debe indicar la mesa',
    path: ['mesaId'],
  })
  .refine((data) => !data.vueltoPara || data.medioPagoPreferido === MedioPagoPreferido.EFECTIVO, {
    message: 'El vuelto solo aplica si el pago es en efectivo',
    path: ['vueltoPara'],
  })
  .refine(
    (data) =>
      data.canalOrigen !== CanalOrigenPedido.DELIVERY ||
      (data.contactoNombre && data.contactoTelefono && data.direccionEntrega),
    {
      message: 'El delivery requiere nombre, teléfono y dirección de entrega',
      path: ['direccionEntrega'],
    },
  )
  .refine(
    (data) =>
      data.canalOrigen !== CanalOrigenPedido.RECOJO ||
      (data.contactoNombre && data.contactoTelefono),
    { message: 'El recojo requiere nombre y teléfono de contacto', path: ['contactoTelefono'] },
  );

export type LineaPedidoPublicoDto = z.infer<typeof lineaPedidoPublicoSchema>;
export type CrearPedidoPublicoDto = z.infer<typeof crearPedidoPublicoSchema>;

export const crearPedidoSchema = z.object({
  // Sin mesaId el pedido es "para llevar" — ver pedido.service.ts: crearPedido.
  mesaId: z.string().uuid().optional(),
  clienteId: z.string().uuid().optional(),
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
