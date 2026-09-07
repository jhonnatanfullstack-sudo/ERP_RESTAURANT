import { z } from 'zod';

export const crearRolSchema = z.object({
  nombre: z.string().trim().min(1).max(50),
  descripcion: z.string().trim().max(255).nullable().optional(),
  permisoIds: z.array(z.string().uuid()).optional().default([]),
});

export const actualizarRolSchema = z.object({
  nombre: z.string().trim().min(1).max(50).optional(),
  descripcion: z.string().trim().max(255).nullable().optional(),
});

export const asignarPermisosSchema = z.object({
  permisoIds: z.array(z.string().uuid()),
});

export type CrearRolDto = z.infer<typeof crearRolSchema>;
export type ActualizarRolDto = z.infer<typeof actualizarRolSchema>;
export type AsignarPermisosDto = z.infer<typeof asignarPermisosSchema>;
