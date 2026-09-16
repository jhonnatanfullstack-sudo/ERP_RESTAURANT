export interface CredencialesOse {
  usuario: string;
  clave: string;
  ambiente: 'beta' | 'produccion';
}

export interface RespuestaOse {
  /** `0` = aceptado. `4xxx` = observado (el CDR sigue siendo válido). Cualquier otro código de
   * SUNAT/OSE = rechazado. `null` cuando no hay un código de negocio confiable que registrar
   * — falla de transporte (red, timeout, servicio caído) o una respuesta que no se pudo
   * interpretar — y el comprobante debe quedar para reintentar, no darse por aceptado ni
   * rechazado. Ver `EstadoComprobante.ERROR_ENVIO`. */
  codigoRespuesta: string | null;
  mensaje: string;
  /** XML del CDR (Constancia de Recepción), ya descomprimido. `null` si no se pudo obtener
   * (rechazo o error de transporte). */
  cdrXml: string | null;
}

/**
 * Contrato que cualquier OSE debe cumplir para conectarse a `facturacion.service.ts`
 * (FASE 28). Recibe el XML **ya firmado** (por `firma/firmador.ts`): ningún proveedor detrás
 * de esta interfaz debe rearmar o resignar el comprobante, solo transportarlo a SUNAT y
 * devolver el resultado.
 */
export interface OseProvider {
  enviarComprobante(
    xmlFirmado: string,
    nombreArchivo: string,
    credenciales: CredencialesOse,
  ): Promise<RespuestaOse>;
}
