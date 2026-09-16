import { z } from 'zod';

export const abrirTurnoSchema = z.object({
  nota: z.string().trim().max(255).optional(),
});

export const cerrarTurnoSchema = z.object({
  nota: z.string().trim().max(255).optional(),
});

export type AbrirTurnoDto = z.infer<typeof abrirTurnoSchema>;
export type CerrarTurnoDto = z.infer<typeof cerrarTurnoSchema>;
