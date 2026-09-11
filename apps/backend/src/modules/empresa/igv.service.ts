import { empresaRepository } from './empresa.repository';
import { empresaIdActual } from '../../database/tenant-context';
import type { TipoAfectacionIgv } from '../catalogos/tipo-afectacion-igv.entity';

/** Tasa general de IGV vigente en Perú (16% IGV + 2% IPM). Cambiar aquí si SUNAT modifica la tasa. */
export const TASA_IGV_GENERAL = 0.18;

/** Tasa especial para MYPE de restaurantes/hoteles/alojamiento turístico (8% IGV + 2.5% IPM,
 * 2026) — no es automática: solo aplica a la empresa que se acogió explícitamente ante SUNAT
 * (Ley N° 31940/32219/32387, Formulario Virtual 621), reflejado en
 * `Empresa.acogidoRegimenMypeRestaurantes`. Verificado en orientacion.sunat.gob.pe, 2026-09-09. */
export const TASA_IGV_MYPE_RESTAURANTES = 0.105;

/** Código del Catálogo SUNAT N° 07 correspondiente a "Gravado - Operación Onerosa". */
export const CODIGO_AFECTACION_GRAVADO = '10';

export function esGravado(tipoAfectacionIgv: TipoAfectacionIgv): boolean {
  return tipoAfectacionIgv.codigo === CODIGO_AFECTACION_GRAVADO;
}

/**
 * La tasa de IGV depende de si la empresa se acogió al régimen especial — nunca es un valor
 * fijo del sistema. Se resuelve contra **la empresa de la petición en curso**: con
 * multi-empresa, dos restaurantes del mismo sistema pueden estar en regímenes distintos, así
 * que tomar "la empresa más antigua" (como se hacía cuando el sistema era de un solo local)
 * le habría aplicado a uno la tasa del otro.
 *
 * Vive en `modules/empresa` y no en `modules/ventas` porque la tasa es un atributo de la
 * empresa, no de la venta: la usan tanto la emisión de comprobantes (`venta.service.ts`)
 * como el costeo de platillos (`recetas/costeo.service.ts`), que necesita descontar el IGV
 * del precio de carta para comparar ingreso neto contra costo neto.
 */
export async function resolverTasaIgv(): Promise<number> {
  const empresa = await empresaRepository.findOneBy({ id: empresaIdActual() });
  return empresa?.acogidoRegimenMypeRestaurantes ? TASA_IGV_MYPE_RESTAURANTES : TASA_IGV_GENERAL;
}
