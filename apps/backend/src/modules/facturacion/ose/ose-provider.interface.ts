export interface CredencialesOse {
  usuario: string;
  clave: string;
  ambiente: 'beta' | 'produccion';
}

/**
 * H13 — resultado discriminado de un intento de envío al OSE. Reemplaza al antiguo
 * `RespuestaOse` (un solo objeto plano con `codigoRespuesta: string | null`, que no permitía
 * distinguir "sabemos que nunca se transmitió" de "no sabemos si se transmitió"): esa
 * distinción es exactamente lo que decide si un comprobante queda en `ERROR_ENVIO` (seguro
 * reintentar automáticamente) o en `RESULTADO_INCIERTO` (requiere reconciliación manual).
 *
 * La clasificación pertenece al proveedor/adaptador OSE (ver `NubefactOseProvider`), no a
 * quien lo consume: solo el código que efectivamente invoca `fetch()` (o el mecanismo de
 * transporte equivalente) sabe con certeza si esa invocación llegó a ocurrir.
 */
export type ResultadoOse =
  | {
      /** Existe una respuesta del OSE suficientemente parseada para determinar el resultado
       * de negocio — aceptado, observado o rechazado (ver `facturacion.service.ts: mapearEstado`). */
      tipo: 'definitiva';
      /** `0` = aceptado. `4xxx` = observado (el CDR sigue siendo válido). Cualquier otro
       * código de SUNAT/OSE = rechazado. */
      codigoRespuesta: string;
      mensaje: string;
      /** XML del CDR (Constancia de Recepción), ya descomprimido. `null` si la respuesta fue
       * un rechazo SOAP sin CDR asociado. */
      cdrXml: string | null;
    }
  | {
      /** Fallo INEQUÍVOCO ocurrido ANTES de invocar el transporte real (ej. no se pudo
       * comprimir el XML, o construir el sobre SOAP) — el documento nunca llegó a
       * transmitirse. Mapea a `EstadoComprobante.ERROR_ENVIO`: seguro reintentar. */
      tipo: 'no_transmitido';
      mensaje: string;
    }
  | {
      /** CUALQUIER fallo desde el momento en que se invoca/espera el transporte real en
       * adelante (abort, timeout, conexión cortada, error leyendo la respuesta, una
       * respuesta SOAP que no se puede interpretar con certeza) — no hay forma de saber, del
       * lado del cliente, si el OSE llegó a recibir el documento. Regla conservadora
       * deliberada: nunca se asume `no_transmitido` desde acá. Mapea a
       * `EstadoComprobante.RESULTADO_INCIERTO`: requiere reconciliación manual, nunca
       * reintento automático. */
      tipo: 'incierta';
      mensaje: string;
    };

/**
 * Contrato que cualquier OSE debe cumplir para conectarse a `facturacion.service.ts`
 * (FASE 28). Recibe el XML **ya firmado** (por `firma/firmador.ts`): ningún proveedor detrás
 * de esta interfaz debe rearmar o resignar el comprobante, solo transportarlo a SUNAT y
 * devolver el resultado clasificado. No debería lanzar excepciones en operación normal —
 * cualquier fallo de transporte se traduce a un `ResultadoOse` (`no_transmitido`/`incierta`),
 * nunca a un `throw` (`facturacion.service.ts` igual se protege ante esto con una red de
 * seguridad, ver `invocarOse`).
 */
export interface OseProvider {
  enviarComprobante(
    xmlFirmado: string,
    nombreArchivo: string,
    credenciales: CredencialesOse,
  ): Promise<ResultadoOse>;
}
