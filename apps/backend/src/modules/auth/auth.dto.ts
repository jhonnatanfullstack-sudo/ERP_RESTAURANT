import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const cambiarPasswordSchema = z.object({
  passwordActual: z.string().min(1),
  passwordNuevo: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(72),
});

export type LoginDto = z.infer<typeof loginSchema>;
export type CambiarPasswordDto = z.infer<typeof cambiarPasswordSchema>;
