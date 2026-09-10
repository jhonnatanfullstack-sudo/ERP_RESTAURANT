import { z } from 'zod';

export const crearEmpresaSchema = z.object({
  ruc: z.string().regex(/^\d{11}$/, 'El RUC debe tener 11 dígitos'),
  razonSocial: z.string().trim().min(1).max(255),
  nombreComercial: z.string().trim().max(255).nullable().optional(),
  direccionFiscal: z.string().trim().max(255).nullable().optional(),
  telefono: z.string().trim().max(20).nullable().optional(),
  email: z.string().trim().email().max(150).nullable().optional(),
  ubigeo: z.string().trim().max(255).nullable().optional(),
  logo: z.string().trim().nullable().optional(),
  acogidoRegimenMypeRestaurantes: z.boolean().optional(),
});

export const actualizarEmpresaSchema = crearEmpresaSchema.partial();

export type CrearEmpresaDto = z.infer<typeof crearEmpresaSchema>;
export type ActualizarEmpresaDto = z.infer<typeof actualizarEmpresaSchema>;
