import { z } from 'zod';

export const crearUsuarioSchema = z.object({
  personalId: z.string().uuid(),
  rolId: z.string().uuid(),
  email: z.string().trim().email().max(150),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(72),
});

export const actualizarUsuarioSchema = z.object({
  rolId: z.string().uuid().optional(),
  email: z.string().trim().email().max(150).optional(),
  activo: z.boolean().optional(),
});

export type CrearUsuarioDto = z.infer<typeof crearUsuarioSchema>;
export type ActualizarUsuarioDto = z.infer<typeof actualizarUsuarioSchema>;
