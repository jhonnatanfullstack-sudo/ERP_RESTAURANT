import { z } from 'zod';
import { TipoReclamacion } from './reclamacion.entity';

/** Lo que un consumidor llena en el Libro de Reclamaciones Virtual, sin autenticarse — ver
 * `carta-publica.routes.ts`. Los campos siguen el formato oficial (D.S. 101-2022-PCM): no se
 * exige ser cliente ni tener boleta para reclamar. */
export const crearReclamacionPublicaSchema = z
  .object({
    tipo: z.enum(TipoReclamacion),
    consumidorNombres: z.string().trim().min(1).max(150),
    consumidorApellidos: z.string().trim().min(1).max(150),
    tipoDocumentoIdentidadId: z.string().uuid(),
    consumidorNumeroDocumento: z.string().trim().min(1).max(15),
    consumidorDomicilio: z.string().trim().min(1).max(255),
    consumidorEmail: z.string().trim().email().max(150),
    consumidorTelefono: z.string().trim().max(20).optional(),
    esMenorEdad: z.boolean().optional(),
    apoderadoNombre: z.string().trim().max(150).optional(),
    apoderadoNumeroDocumento: z.string().trim().max(15).optional(),
    descripcionBien: z.string().trim().min(1).max(255),
    montoReclamado: z.coerce.number().positive().optional(),
    detalle: z.string().trim().min(10).max(4000),
    pedido: z.string().trim().min(5).max(1000),
  })
  .refine(
    (data) => !data.esMenorEdad || (data.apoderadoNombre && data.apoderadoNumeroDocumento),
    {
      message: 'Si el consumidor es menor de edad, indica el nombre y documento del apoderado',
      path: ['apoderadoNombre'],
    },
  );

export const responderReclamacionSchema = z.object({
  respuestaProveedor: z.string().trim().min(1).max(4000),
});

export type CrearReclamacionPublicaDto = z.infer<typeof crearReclamacionPublicaSchema>;
export type ResponderReclamacionDto = z.infer<typeof responderReclamacionSchema>;
