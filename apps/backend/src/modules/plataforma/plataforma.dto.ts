import { z } from 'zod';

export const accionEmpresaSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('activar') }),
  z.object({
    tipo: z.literal('extender_demo'),
    // Tope de 365 días: más que eso ya no es una prueba, es una cuenta activa — y para eso
    // está la acción "activar", que además deja el estado correcto en el panel.
    dias: z.number().int().min(1).max(365),
  }),
  z.object({ tipo: z.literal('suspender') }),
  z.object({ tipo: z.literal('reactivar') }),
]);

export type AccionEmpresaDto = z.infer<typeof accionEmpresaSchema>;
