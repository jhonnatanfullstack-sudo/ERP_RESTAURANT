import { z } from 'zod';

export const crearProveedorSchema = z.object({
  nombres: z.string().trim().min(1).max(150).nullable().optional(),
  apellidos: z.string().trim().max(150).nullable().optional(),
  razonSocial: z.string().trim().min(1).max(255).nullable().optional(),
  tipoDocumentoIdentidadId: z.string().uuid(),
  numeroDocumento: z.string().trim().min(1).max(20),
  telefono: z.string().trim().max(20).nullable().optional(),
  email: z.string().trim().email().max(150).nullable().optional(),
  direccion: z.string().trim().max(255).nullable().optional(),
});

export const actualizarProveedorSchema = z.object({
  nombres: z.string().trim().min(1).max(150).nullable().optional(),
  apellidos: z.string().trim().max(150).nullable().optional(),
  razonSocial: z.string().trim().min(1).max(255).nullable().optional(),
  tipoDocumentoIdentidadId: z.string().uuid().optional(),
  numeroDocumento: z.string().trim().min(1).max(20).optional(),
  telefono: z.string().trim().max(20).nullable().optional(),
  email: z.string().trim().email().max(150).nullable().optional(),
  direccion: z.string().trim().max(255).nullable().optional(),
  activo: z.boolean().optional(),
});

export type CrearProveedorDto = z.infer<typeof crearProveedorSchema>;
export type ActualizarProveedorDto = z.infer<typeof actualizarProveedorSchema>;
