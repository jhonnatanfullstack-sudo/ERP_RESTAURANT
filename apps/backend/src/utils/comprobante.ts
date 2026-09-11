/** Dígitos del correlativo en el número de un comprobante, según el formato SUNAT
 * (serie de 4 + guion + correlativo de 8): "B001-00000001". */
export const DIGITOS_CORRELATIVO = 8;

/** Número completo de un comprobante, con el correlativo rellenado con ceros a la izquierda. */
export function formatearNumeroComprobante(serie: string, numero: number): string {
  return `${serie}-${String(numero).padStart(DIGITOS_CORRELATIVO, '0')}`;
}
