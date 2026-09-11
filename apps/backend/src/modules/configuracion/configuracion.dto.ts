import { z } from 'zod';

/** Texto opcional que se puede vaciar: la cadena vacía se guarda como `null` para no
 * distinguir entre "sin horario" y "horario en blanco". */
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((valor) => valor || null)
    .nullable()
    .optional();

const urlOpcional = z
  .string()
  .trim()
  .max(255)
  .transform((valor) => valor || null)
  .nullable()
  .optional()
  .refine(
    (valor) => valor === null || valor === undefined || /^https?:\/\//.test(valor),
    'El enlace debe empezar con http:// o https://',
  );

export const actualizarConfiguracionSchema = z
  .object({
    // 10 minutos como mínimo: una reserva más corta no bloquea la mesa de forma útil.
    // 8 horas como máximo: por encima de eso ya no es una reserva, es un evento privado.
    duracionReservaMinutos: z.coerce.number().int().min(10).max(480).optional(),
    // Menos de 3 segundos castiga al servidor sin que la cocina lo note; más de 2 minutos
    // deja de servir para una cola que cambia constantemente.
    segundosRefrescoCocina: z.coerce.number().int().min(3).max(120).optional(),
    diasCreditoPorDefecto: z.coerce.number().int().min(1).max(365).optional(),
    foodCostObjetivo: z.coerce.number().int().min(1).max(99).optional(),
    foodCostCritico: z.coerce.number().int().min(1).max(99).optional(),
    horarioAtencion: textoOpcional(255),
    mensajeBienvenida: textoOpcional(500),
    aceptaPedidosWhatsapp: z.boolean().optional(),
    facebookUrl: urlOpcional,
    instagramUrl: urlOpcional,
    tiktokUrl: urlOpcional,
  })
  // El umbral crítico tiene que estar por encima del objetivo, o el semáforo de `/costos`
  // quedaría sin franja ámbar y marcaría en rojo platos que están dentro de lo esperado.
  .refine(
    (datos) =>
      datos.foodCostObjetivo === undefined ||
      datos.foodCostCritico === undefined ||
      datos.foodCostCritico > datos.foodCostObjetivo,
    {
      message: 'El food cost crítico debe ser mayor que el objetivo',
      path: ['foodCostCritico'],
    },
  );

export type ActualizarConfiguracionDto = z.infer<typeof actualizarConfiguracionSchema>;
