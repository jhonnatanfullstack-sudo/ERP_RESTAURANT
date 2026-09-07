import { HttpError } from '../../utils/http-error';
import type { TipoDocumentoIdentidad } from './tipo-documento-identidad.entity';

/**
 * Formato esperado del número de documento por código de catálogo SUNAT 06.
 * DNI (1) y RUC (6) tienen formato oficial fijo; CE (4) y Pasaporte (7) son
 * alfanuméricos de longitud variable; "Sin documento" (0) no se valida.
 *
 * Compartido entre Personal y Clientes (ambos identifican personas por un
 * tipo+número de documento SUNAT), para no duplicar la regla de validación.
 */
const FORMATOS_DOCUMENTO: Record<string, { patron: RegExp; mensaje: string }> = {
  '1': { patron: /^\d{8}$/, mensaje: 'El DNI debe tener exactamente 8 dígitos' },
  '6': { patron: /^\d{11}$/, mensaje: 'El RUC debe tener exactamente 11 dígitos' },
  '4': {
    patron: /^[A-Za-z0-9]{6,12}$/,
    mensaje: 'El Carné de Extranjería debe tener entre 6 y 12 caracteres alfanuméricos',
  },
  '7': {
    patron: /^[A-Za-z0-9]{6,12}$/,
    mensaje: 'El Pasaporte debe tener entre 6 y 12 caracteres alfanuméricos',
  },
};

export function validarFormatoDocumento(
  tipoDocumentoIdentidad: TipoDocumentoIdentidad,
  numeroDocumento: string,
): void {
  const formato = FORMATOS_DOCUMENTO[tipoDocumentoIdentidad.codigo];
  if (formato && !formato.patron.test(numeroDocumento)) {
    throw new HttpError(400, formato.mensaje, [
      'numeroDocumento no coincide con el tipo de documento',
    ]);
  }
}
