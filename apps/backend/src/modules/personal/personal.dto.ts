import { z } from 'zod';

export const crearPersonalSchema = z.object({
  empresaId: z.string().uuid(),
  tipoDocumentoIdentidadId: z.string().uuid(),
  numeroDocumento: z.string().trim().min(1).max(20),
  // nombres/apellidos y razonSocial son excluyentes segun el tipo de documento:
  // la regla vive en personal.service.ts (validarNombreORazonSocial), no aqui,
  // porque depende del catalogo SUNAT y de la BD.
  nombres: z.string().trim().min(1).max(150).nullable().optional(),
  apellidoPaterno: z.string().trim().max(100).nullable().optional(),
  apellidoMaterno: z.string().trim().max(100).nullable().optional(),
  razonSocial: z.string().trim().min(1).max(255).nullable().optional(),
  fechaNacimiento: z.string().date().nullable().optional(),
  telefono: z.string().trim().max(20).nullable().optional(),
  direccion: z.string().trim().max(255).nullable().optional(),
  fechaIngreso: z.string().date().nullable().optional(),
});

export const actualizarPersonalSchema = crearPersonalSchema.partial().extend({
  activo: z.boolean().optional(),
});

export type CrearPersonalDto = z.infer<typeof crearPersonalSchema>;
export type ActualizarPersonalDto = z.infer<typeof actualizarPersonalSchema>;
