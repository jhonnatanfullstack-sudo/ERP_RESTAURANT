import { z } from 'zod';
import { AmbienteFacturacion, ProveedorOse } from './configuracion-facturacion.entity';

export const guardarConfiguracionFacturacionSchema = z.object({
  oseProveedor: z.enum(ProveedorOse).nullable().optional(),
  oseUsuario: z.string().trim().max(100).nullable().optional(),
  /** Solo se manda cuando se quiere establecer/cambiar la credencial — omitirla conserva la
   * que ya estaba guardada (cifrada), igual que dejar en blanco un campo de contraseña en
   * cualquier formulario de edición. */
  oseClave: z.string().trim().min(1).max(255).optional(),
  ambiente: z.enum(AmbienteFacturacion).optional(),
  activo: z.boolean().optional(),
});

export type GuardarConfiguracionFacturacionDto = z.infer<
  typeof guardarConfiguracionFacturacionSchema
>;
