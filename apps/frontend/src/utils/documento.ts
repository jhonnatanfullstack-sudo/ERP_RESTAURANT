/**
 * Formato esperado del número de documento por código del catálogo SUNAT 06.
 * Debe reflejar las mismas reglas que el backend (personal.service.ts) —
 * esto es solo para feedback inmediato en el formulario; la validación real
 * ocurre en el servidor.
 */
export const FORMATOS_DOCUMENTO: Record<
  string,
  { maxLength: number; patron: RegExp; ayuda: string }
> = {
  '1': { maxLength: 8, patron: /^\d{0,8}$/, ayuda: 'DNI: 8 dígitos' },
  '6': { maxLength: 11, patron: /^\d{0,11}$/, ayuda: 'RUC: 11 dígitos' },
  '4': {
    maxLength: 12,
    patron: /^[A-Za-z0-9]{0,12}$/,
    ayuda: 'Carné de Extranjería: 6-12 caracteres',
  },
  '7': { maxLength: 12, patron: /^[A-Za-z0-9]{0,12}$/, ayuda: 'Pasaporte: 6-12 caracteres' },
};

/** Códigos del catálogo SUNAT 06 que apis.net.pe puede consultar (DNI/RUC). */
export const CODIGOS_CONSULTABLES: Record<string, 'dni' | 'ruc'> = { '1': 'dni', '6': 'ruc' };

const CODIGO_RUC = '6';
const PREFIJO_RUC_PERSONA_JURIDICA = '20';

/** Un RUC que empieza en "20" es de persona jurídica (empresa): se identifica por razón
 * social, no por nombres/apellidos. Debe reflejar la misma regla que el backend
 * (cliente.service.ts: esPersonaJuridica). */
export function esRucPersonaJuridica(
  codigoTipoDocumento: string | undefined,
  numeroDocumento: string | undefined,
): boolean {
  return (
    codigoTipoDocumento === CODIGO_RUC &&
    !!numeroDocumento?.startsWith(PREFIJO_RUC_PERSONA_JURIDICA)
  );
}
