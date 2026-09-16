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
    fidelizacionActiva: z.boolean().optional(),
    // Menos de S/1 por punto regalaría demasiado rápido; por encima de S/1000 el programa
    // prácticamente nunca da puntos.
    solesPorPunto: z.coerce.number().min(1).max(1000).optional(),
    // El valor de canje no puede superar lo que costó ganarlo, o el restaurante perdería
    // dinero en cada punto acumulado.
    valorCanjePunto: z.coerce.number().min(0.01).max(1000).optional(),
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
  )
  // El valor de canje de un punto no puede superar lo que costó ganarlo (soles por punto),
  // o cada punto acumulado le costaría más al restaurante de lo que valió la venta que lo
  // generó. Solo se valida cuando ambos vienen juntos en la misma actualización, igual que
  // el food cost de arriba.
  .refine(
    (datos) =>
      datos.solesPorPunto === undefined ||
      datos.valorCanjePunto === undefined ||
      datos.valorCanjePunto <= datos.solesPorPunto,
    {
      message: 'El valor de canje no puede superar lo que cuesta ganar un punto',
      path: ['valorCanjePunto'],
    },
  );

export type ActualizarConfiguracionDto = z.infer<typeof actualizarConfiguracionSchema>;
