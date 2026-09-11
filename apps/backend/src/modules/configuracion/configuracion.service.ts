import { empresaIdActual } from '../../database/tenant-context';
import { configuracionRepository } from './configuracion.repository';
import type { ActualizarConfiguracionDto } from './configuracion.dto';
import type { Configuracion } from './configuracion.entity';

export interface ConfiguracionResuelta {
  duracionReservaMinutos: number;
  segundosRefrescoCocina: number;
  diasCreditoPorDefecto: number;
  foodCostObjetivo: number;
  foodCostCritico: number;
  horarioAtencion: string | null;
  mensajeBienvenida: string | null;
  aceptaPedidosWhatsapp: boolean;
  facebookUrl: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
}

/** Valores por defecto. Son los mismos que estaban escritos en el código antes de FASE 21,
 * para que una empresa que nunca toque esta pantalla se comporte exactamente igual que antes. */
export const CONFIGURACION_POR_DEFECTO: ConfiguracionResuelta = {
  duracionReservaMinutos: 90,
  segundosRefrescoCocina: 8,
  diasCreditoPorDefecto: 30,
  foodCostObjetivo: 35,
  foodCostCritico: 50,
  horarioAtencion: null,
  mensajeBienvenida: null,
  aceptaPedidosWhatsapp: true,
  facebookUrl: null,
  instagramUrl: null,
  tiktokUrl: null,
};

function aResuelta(configuracion: Configuracion | null): ConfiguracionResuelta {
  if (!configuracion) return { ...CONFIGURACION_POR_DEFECTO };
  return {
    duracionReservaMinutos: configuracion.duracionReservaMinutos,
    segundosRefrescoCocina: configuracion.segundosRefrescoCocina,
    diasCreditoPorDefecto: configuracion.diasCreditoPorDefecto,
    foodCostObjetivo: configuracion.foodCostObjetivo,
    foodCostCritico: configuracion.foodCostCritico,
    horarioAtencion: configuracion.horarioAtencion,
    mensajeBienvenida: configuracion.mensajeBienvenida,
    aceptaPedidosWhatsapp: configuracion.aceptaPedidosWhatsapp,
    facebookUrl: configuracion.facebookUrl,
    instagramUrl: configuracion.instagramUrl,
    tiktokUrl: configuracion.tiktokUrl,
  };
}

/**
 * Configuración de la empresa de la petición. **Leer no crea la fila**: si la empresa nunca
 * guardó su configuración, devuelve los valores por defecto sin escribir nada. Una petición
 * de lectura no debería tener efectos secundarios, y así tampoco hace falta sembrar una fila
 * por cada empresa nueva ni hacer un backfill para las que ya existían.
 */
export async function obtenerConfiguracion(): Promise<ConfiguracionResuelta> {
  const configuracion = await configuracionRepository.findOneBy({
    empresa: { id: empresaIdActual() },
  });
  return aResuelta(configuracion);
}

export async function actualizarConfiguracion(
  dto: ActualizarConfiguracionDto,
): Promise<ConfiguracionResuelta> {
  const empresaId = empresaIdActual();
  const existente = await configuracionRepository.findOneBy({ empresa: { id: empresaId } });

  const configuracion = existente
    ? configuracionRepository.merge(existente, dto)
    : configuracionRepository.create({ ...CONFIGURACION_POR_DEFECTO, ...dto });

  return aResuelta(await configuracionRepository.save(configuracion));
}

/**
 * Subconjunto que la carta pública puede mostrar sin autenticación. Se enumera de forma
 * explícita en vez de devolver la configuración entera: los umbrales de food cost y los días
 * de crédito son información interna del negocio, no algo que deba viajar al celular de
 * cualquier comensal.
 */
export async function obtenerConfiguracionPublica(): Promise<{
  horarioAtencion: string | null;
  mensajeBienvenida: string | null;
  aceptaPedidosWhatsapp: boolean;
  facebookUrl: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
}> {
  const {
    horarioAtencion,
    mensajeBienvenida,
    aceptaPedidosWhatsapp,
    facebookUrl,
    instagramUrl,
    tiktokUrl,
  } = await obtenerConfiguracion();
  return {
    horarioAtencion,
    mensajeBienvenida,
    aceptaPedidosWhatsapp,
    facebookUrl,
    instagramUrl,
    tiktokUrl,
  };
}
