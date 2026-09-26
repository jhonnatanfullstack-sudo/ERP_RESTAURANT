import JSZip from 'jszip';
import { escaparXml } from '../ubl/xml.util';
import type { CredencialesOse, OseProvider, ResultadoOse } from './ose-provider.interface';

/**
 * NubeFacT OSE (`ose.nubefact.com`) — el producto que recibe el XML **ya firmado** (no el que
 * arma el XML desde una "trama" JSON propia). Implementa el mismo contrato `billService` que
 * usa SUNAT para su propio SEE-SOL: SOAP + WS-Security (UsernameToken/PasswordText), el XML
 * firmado va comprimido en un `.zip` y codificado en Base64. Es el contrato estándar que
 * replican casi todos los OSE peruanos, así que este cliente también sirve de referencia si
 * algún día se agrega un segundo proveedor.
 *
 * Endpoints confirmados contra la documentación pública de NubeFacT
 * (https://ayuda.nubefact.com/preguntas/ose/metodos-de-envio/sendbill):
 * `https://ose.nubefact.com/ol-ti-itcpe/billService` (producción) y
 * `https://demo-ose.nubefact.com/ol-ti-itcpe/billService` (beta/pruebas).
 */
const ENDPOINT_POR_AMBIENTE: Record<CredencialesOse['ambiente'], string> = {
  produccion: 'https://ose.nubefact.com/ol-ti-itcpe/billService',
  beta: 'https://demo-ose.nubefact.com/ol-ti-itcpe/billService',
};

const TIMEOUT_MS = 30_000;

function construirSobreSoap(
  nombreArchivo: string,
  contenidoZipBase64: string,
  credenciales: CredencialesOse,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:ser="http://service.sunat.gob.pe"
  xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
  <soapenv:Header>
    <wsse:Security>
      <wsse:UsernameToken>
        <wsse:Username>${escaparXml(credenciales.usuario)}</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${escaparXml(credenciales.clave)}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soapenv:Header>
  <soapenv:Body>
    <ser:sendBill>
      <fileName>${escaparXml(nombreArchivo)}.zip</fileName>
      <contentFile>${contenidoZipBase64}</contentFile>
    </ser:sendBill>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/** Un `.zip` con un único archivo — SUNAT y sus OSE exigen el XML así, nunca suelto. */
async function comprimirXml(xmlFirmado: string, nombreArchivo: string): Promise<string> {
  const zip = new JSZip();
  zip.file(`${nombreArchivo}.xml`, xmlFirmado);
  return zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
}

/** El CDR llega como un `.zip` en Base64 dentro de `applicationResponse`, con un único XML
 * adentro (`R-<nombreArchivo>.xml`) — se descomprime para guardar el XML tal cual. */
async function descomprimirCdr(zipBase64: string): Promise<string | null> {
  const zip = await JSZip.loadAsync(Buffer.from(zipBase64, 'base64'));
  const archivo = Object.values(zip.files).find((f) => f.name.endsWith('.xml'));
  return archivo ? archivo.async('text') : null;
}

/** Extrae un tag `<applicationResponse>` (éxito) sin exigir declarar el namespace exacto que
 * use la respuesta — SOAP suele variar el prefijo según el servidor. */
function extraerEtiqueta(xml: string, etiqueta: string): string | null {
  const coincidencia = new RegExp(`<(?:\\w+:)?${etiqueta}>([^<]*)</(?:\\w+:)?${etiqueta}>`).exec(
    xml,
  );
  return coincidencia ? coincidencia[1] : null;
}

export class NubefactOseProvider implements OseProvider {
  async enviarComprobante(
    xmlFirmado: string,
    nombreArchivo: string,
    credenciales: CredencialesOse,
  ): Promise<ResultadoOse> {
    // Todo lo que ocurre ANTES de esta línea (comprimir, armar el sobre SOAP) es local, sin
    // ningún I/O de red — si algo de esto fallara, el documento nunca llegó a transmitirse.
    let zipBase64: string;
    let sobre: string;
    try {
      zipBase64 = await comprimirXml(xmlFirmado, nombreArchivo);
      sobre = construirSobreSoap(nombreArchivo, zipBase64, credenciales);
    } catch (error) {
      return {
        tipo: 'no_transmitido',
        mensaje: error instanceof Error ? error.message : 'No se pudo preparar el envío al OSE',
      };
    }

    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS);
    let cuerpo: string;
    try {
      const respuesta = await fetch(ENDPOINT_POR_AMBIENTE[credenciales.ambiente], {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml;charset=UTF-8', SOAPAction: '' },
        body: sobre,
        signal: controlador.signal,
      });
      cuerpo = await respuesta.text();
    } catch (error) {
      // H13 — regla conservadora deliberada: desde que se invoca `fetch` en adelante,
      // CUALQUIER fallo (abort/timeout propio, `TypeError: fetch failed`, conexión cortada a
      // mitad de la respuesta) es AMBIGUO. No hay forma de saber, del lado del cliente, si el
      // OSE llegó a recibir el documento antes de que el error ocurriera — nunca se asume
      // "no transmitido" desde acá, aunque el error "parezca" de conexión.
      return {
        tipo: 'incierta',
        mensaje: error instanceof Error ? error.message : 'No se pudo conectar con el OSE',
      };
    } finally {
      clearTimeout(temporizador);
    }

    const applicationResponse = extraerEtiqueta(cuerpo, 'applicationResponse');
    if (applicationResponse) {
      let cdrXml: string | null;
      try {
        cdrXml = await descomprimirCdr(applicationResponse);
      } catch {
        // El transporte funcionó y el OSE respondió, pero el CDR no se pudo descomprimir —
        // "error leyendo la respuesta": también ambiguo, no un rechazo ni un no-transmitido.
        return {
          tipo: 'incierta',
          mensaje: 'El OSE devolvió una respuesta que no se pudo descomprimir',
        };
      }
      // Sin código de respuesta legible dentro del CDR no hay forma honesta de decir
      // "aceptado" ni "rechazado" — "respuesta SOAP imposible de interpretar con certeza".
      const codigoRespuesta = cdrXml ? extraerEtiqueta(cdrXml, 'cbc:ResponseCode') : null;
      if (!codigoRespuesta) {
        return {
          tipo: 'incierta',
          mensaje: 'El OSE devolvió una respuesta que no se pudo interpretar',
        };
      }
      const mensaje =
        (cdrXml && extraerEtiqueta(cdrXml, 'cbc:Description')) ?? 'Comprobante procesado por el OSE';
      return { tipo: 'definitiva', codigoRespuesta: codigoRespuesta.slice(0, 10), mensaje, cdrXml };
    }

    // SOAP Fault: el mismo contrato de error que usa SUNAT en su propio SEE-SOL. Solo `<cod>`
    // (el código de negocio SUNAT, dentro de `<detail>`) es un código corto y numérico; el
    // `faultcode` del sobre SOAP es un valor genérico tipo `soapenv:Server` — no sirve como
    // `codigoRespuesta` (pensado para "0"/"4xxx"/etc.) y se deja solo en el mensaje.
    const codigo = extraerEtiqueta(cuerpo, 'cod');
    const faultcode = extraerEtiqueta(cuerpo, 'faultcode');
    const mensaje =
      extraerEtiqueta(cuerpo, 'message') ??
      extraerEtiqueta(cuerpo, 'faultstring') ??
      (faultcode
        ? `El OSE rechazó el envío (${faultcode})`
        : 'El OSE rechazó el envío sin detalle del motivo');

    if (!codigo) {
      // SOAP Fault sin ningún código de negocio SUNAT extraíble — "error SOAP ambiguo": el
      // transporte funcionó, pero no hay evidencia suficiente para decir que SUNAT rechazó
      // formalmente el documento (podría ser un error del propio OSE, no de negocio).
      return { tipo: 'incierta', mensaje };
    }
    return { tipo: 'definitiva', codigoRespuesta: codigo.slice(0, 10), mensaje, cdrXml: null };
  }
}
