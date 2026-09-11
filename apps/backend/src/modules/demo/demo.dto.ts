import { z } from 'zod';

/** Un slug legible para la URL pública de la carta: minúsculas, números y guiones. */
export const SLUG_RESERVADOS = ['api', 'admin', 'login', 'carta', 'demo', 'proveedor', 'uploads'];

export const registrarDemoSchema = z.object({
  // El RUC es obligatorio aunque sea una prueba: es un ERP peruano (sin RUC no se puede
  // facturar, que es la mitad del sistema), la búsqueda en SUNAT ya existe, y al ser único
  // limita naturalmente el registro a una demo por negocio real.
  ruc: z
    .string()
    .trim()
    .regex(/^(10|15|17|20)\d{9}$/, 'El RUC debe tener 11 dígitos y empezar en 10, 15, 17 o 20'),
  razonSocial: z.string().trim().min(3).max(255),
  nombreComercial: z.string().trim().max(255).optional(),
  direccionFiscal: z.string().trim().max(255).optional(),
  telefono: z.string().trim().max(20).optional(),

  // Datos de la persona que va a administrar el sistema.
  nombres: z.string().trim().min(2).max(100),
  apellidoPaterno: z.string().trim().min(2).max(100),
  apellidoMaterno: z.string().trim().max(100).optional(),
  tipoDocumentoIdentidadId: z.string().uuid(),
  numeroDocumento: z.string().trim().min(8).max(15),

  email: z.string().trim().toLowerCase().email().max(150),
  password: z
    .string()
    .min(10, 'La contraseña debe tener al menos 10 caracteres')
    .max(72, 'La contraseña no puede exceder 72 caracteres'),
});

export type RegistrarDemoDto = z.infer<typeof registrarDemoSchema>;
