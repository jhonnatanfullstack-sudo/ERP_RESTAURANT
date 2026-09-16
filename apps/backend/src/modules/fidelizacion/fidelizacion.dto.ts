import { z } from 'zod';

export const canjearPuntosSchema = z.object({
  clienteId: z.string().uuid(),
  puntos: z.coerce.number().int().positive(),
  ventaId: z.string().uuid().optional(),
  observacion: z.string().trim().max(255).optional(),
});

export const ajustarPuntosSchema = z.object({
  clienteId: z.string().uuid(),
  // Nunca 0: un ajuste que no cambia nada no es un ajuste.
  puntos: z.coerce.number().int().refine((valor) => valor !== 0, 'Los puntos no pueden ser 0'),
  observacion: z.string().trim().min(3).max(255),
});

export type CanjearPuntosDto = z.infer<typeof canjearPuntosSchema>;
export type AjustarPuntosDto = z.infer<typeof ajustarPuntosSchema>;
