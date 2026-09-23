import { SignedXml } from 'xml-crypto';
import type { CertificadoDigital } from './certificado';

/** Id de la firma. Debe coincidir con el `<cbc:URI>#SignatureSP</cbc:URI>` que el XML ya
 * declara en `cac:DigitalSignatureAttachment` (ver `ubl/factura.builder.ts`). */
const ID_FIRMA = 'SignatureSP';

/**
 * SUNAT documenta sus ejemplos de firma con SHA-1 y es lo que aceptan sus servicios. Se deja
 * como constante nombrada porque, si SUNAT endurece el requisito a SHA-256, este es el único
 * punto a cambiar.
 */
const ALGORITMO_FIRMA = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1';
const ALGORITMO_DIGEST = 'http://www.w3.org/2000/09/xmldsig#sha1';
const CANONICALIZACION = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';

export interface ResultadoFirma {
  xmlFirmado: string;
  /** DigestValue de la firma: va impreso en la representación y dentro del código QR. */
  hash: string;
}

/**
 * Firma el XML UBL con firma digital envuelta (enveloped XML-DSig), insertándola dentro de
 * `ext:ExtensionContent`, que es donde SUNAT espera encontrarla.
 *
 * La referencia apunta al documento completo (`URI=""`) con la transformación
 * `enveloped-signature`, de modo que la propia firma queda excluida de lo que se resume: sin
 * eso el digest cambiaría al insertarla y nunca validaría.
 */
export function firmarXml(xml: string, certificado: CertificadoDigital): ResultadoFirma {
  const firmador = new SignedXml({
    privateKey: certificado.clavePrivadaPem,
    publicCert: certificado.certificadoPem,
    signatureAlgorithm: ALGORITMO_FIRMA,
    canonicalizationAlgorithm: CANONICALIZACION,
  });

  firmador.addReference({
    // `/*` selecciona el elemento raíz: la referencia cubre el documento entero, que es lo
    // que representa el `URI=""` de la firma envuelta.
    xpath: '/*',
    uri: '',
    // Sin esto xml-crypto le pone un `Id` al elemento raíz y referencia `URI="#_0"`. SUNAT
    // espera la forma canónica `URI=""` y no admite atributos extra en `<Invoice>`.
    isEmptyUri: true,
    // La canonicalización explícita al final es obligatoria, no cosmética: sin ella
    // `xml-crypto` calcula el digest de firma con un `toString()` de DOM crudo (no es
    // Canonical XML real), pero al verificar sí aplica canonicalización real cuando detecta
    // que el último transform es `enveloped-signature` — el digest firmado y el verificado
    // quedan calculados con dos serializaciones distintas del mismo documento, y cualquier
    // verificador que siga el estándar (SUNAT, NubeFacT) lo rechaza como "documento alterado"
    // aunque la firma nunca se haya tocado.
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      CANONICALIZACION,
    ],
    digestAlgorithm: ALGORITMO_DIGEST,
  });

  firmador.computeSignature(xml, {
    prefix: 'ds',
    attrs: { Id: ID_FIRMA },
    location: {
      // La firma se cuelga dentro del contenedor que el builder dejó vacío a propósito.
      reference: "//*[local-name(.)='ExtensionContent']",
      action: 'append',
    },
  });

  const xmlFirmado = firmador.getSignedXml();
  const hash = extraerDigest(xmlFirmado);

  return { xmlFirmado, hash };
}

/** Lee el `DigestValue` ya calculado del XML firmado, sin volver a resumir nada. */
function extraerDigest(xmlFirmado: string): string {
  const coincidencia = /<ds:DigestValue>([^<]*)<\/ds:DigestValue>/.exec(xmlFirmado);
  if (!coincidencia) {
    throw new Error('El XML firmado no contiene DigestValue: la firma no se generó bien');
  }
  return coincidencia[1];
}
