import { z } from 'zod';
import { AccionAuditoria } from './registro-auditoria.entity';

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato YYYY-MM-DD');

/** Filtros y paginación de la bitácora. El tope de `porPagina` evita que alguien pida la
 * tabla entera con `?porPagina=999999` y tumbe el servidor. */
export const consultaAuditoriaSchema = z.object({
  usuarioId: z.string().uuid().optional(),
  modulo: z.string().trim().max(50).optional(),
  accion: z.nativeEnum(AccionAuditoria).optional(),
  desde: fecha.optional(),
  hasta: fecha.optional(),
  pagina: z.coerce.number().int().positive().default(1),
  porPagina: z.coerce.number().int().positive().max(100).default(25),
});

export type ConsultaAuditoriaDto = z.infer<typeof consultaAuditoriaSchema>;
