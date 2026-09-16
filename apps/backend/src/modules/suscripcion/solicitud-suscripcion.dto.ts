import { z } from 'zod';
import { PlanContratado } from '../empresa/empresa.entity';
import { CicloFacturacion } from './planes';

export const crearSolicitudSchema = z.object({
  plan: z.enum(PlanContratado),
  ciclo: z.enum(CicloFacturacion),
  mensajeContacto: z.string().trim().max(500).optional(),
});

export type CrearSolicitudDto = z.infer<typeof crearSolicitudSchema>;
