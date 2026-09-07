import { z } from 'zod';

export const crearClienteSchema = z.object({
  nombres: z.string().trim().min(1).max(150),
  apellidos: z.string().trim().max(150).nullable().optional(),
  tipoDocumentoIdentidadId: z.string().uuid().nullable().optional(),
  numeroDocumento: z.string().trim().max(20).nullable().optional(),
  telefono: z.string().trim().max(20).nullable().optional(),
  email: z.string().trim().email().max(150).nullable().optional(),
  direccion: z.string().trim().max(255).nullable().optional(),
});

export const actualizarClienteSchema = z.object({
  nombres: z.string().trim().min(1).max(150).optional(),
  apellidos: z.string().trim().max(150).nullable().optional(),
  tipoDocumentoIdentidadId: z.string().uuid().nullable().optional(),
  numeroDocumento: z.string().trim().max(20).nullable().optional(),
  telefono: z.string().trim().max(20).nullable().optional(),
  email: z.string().trim().email().max(150).nullable().optional(),
  direccion: z.string().trim().max(255).nullable().optional(),
  activo: z.boolean().optional(),
});

export type CrearClienteDto = z.infer<typeof crearClienteSchema>;
export type ActualizarClienteDto = z.infer<typeof actualizarClienteSchema>;
