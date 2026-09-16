import { readFileSync } from 'node:fs';
import forge from 'node-forge';

export interface CertificadoDigital {
  /** Clave privada en PEM, para firmar. */
  clavePrivadaPem: string;
  /** Certificado X.509 en PEM, que se incrusta en la firma para que SUNAT pueda validarla. */
  certificadoPem: string;
  /** Fecha de vencimiento del certificado, tal como viene en el propio X.509 — para poder
   * avisar antes de que expire (FASE 28), sin tener que volver a parsear el PEM después. */
  validoHasta: Date;
}

/**
 * Extrae clave privada + certificado de un PKCS#12 (`.pfx`/`.p12`), que es como lo entregan
 * las entidades certificadoras acreditadas por INDECOPI y también SUNAT con su certificado
 * tributario gratuito. `contenido` va en codificación `binary` (1 byte = 1 carácter), no utf8.
 */
function extraerDePkcs12(contenido: string, contrasena: string): CertificadoDigital {
  const asn1 = forge.asn1.fromDer(contenido);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, contrasena);

  const bolsasClave = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const clave = bolsasClave[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key;
  const bolsasCert = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certificado = bolsasCert[forge.pki.oids.certBag]?.[0]?.cert;

  if (!clave || !certificado) {
    throw new Error('El archivo .pfx/.p12 no contiene una clave privada y un certificado válidos');
  }

  return {
    clavePrivadaPem: forge.pki.privateKeyToPem(clave),
    certificadoPem: forge.pki.certificateToPem(certificado),
    validoHasta: certificado.validity.notAfter,
  };
}

/**
 * Carga un certificado digital desde una ruta de archivo. La ruta y la contraseña llegan por
 * variables de entorno y nunca se guardan en el repositorio: el `.pfx` es la identidad
 * tributaria de quien lo usa y quien lo tenga puede emitir comprobantes a su nombre.
 *
 * Sirve para un despliegue de un solo certificado (pruebas locales); en producción
 * multi-empresa cada empresa trae el suyo, ya en memoria — ver `cargarPkcs12DesdeBuffer`.
 */
export function cargarPkcs12(ruta: string, contrasena: string): CertificadoDigital {
  return extraerDePkcs12(readFileSync(ruta, 'binary'), contrasena);
}

/**
 * Igual que `cargarPkcs12`, pero a partir de un `Buffer` ya en memoria (el `.pfx` descifrado
 * de `configuraciones_facturacion`, FASE 28) — nunca se escribe a disco: por eso el multi-tenant
 * necesita esta variante en vez de reusar `cargarPkcs12` con un archivo temporal.
 */
export function cargarPkcs12DesdeBuffer(contenido: Buffer, contrasena: string): CertificadoDigital {
  return extraerDePkcs12(contenido.toString('binary'), contrasena);
}

/**
 * Genera un certificado autofirmado para trabajar contra el ambiente **beta** de SUNAT, que
 * no valida la cadena de confianza del emisor. Sirve para desarrollar y probar el circuito
 * completo antes de comprar el certificado real.
 *
 * NO sirve para producción: ahí SUNAT exige un certificado emitido por una entidad
 * acreditada ante INDECOPI, y un comprobante firmado con este sería rechazado.
 */
export function generarCertificadoPruebas(ruc: string, razonSocial: string): CertificadoDigital {
  const par = forge.pki.rsa.generateKeyPair(2048);
  const certificado = forge.pki.createCertificate();

  certificado.publicKey = par.publicKey;
  certificado.serialNumber = '01';
  certificado.validity.notBefore = new Date();
  certificado.validity.notAfter = new Date();
  certificado.validity.notAfter.setFullYear(certificado.validity.notBefore.getFullYear() + 2);

  const atributos = [
    { name: 'commonName', value: razonSocial },
    { name: 'countryName', value: 'PE' },
    { name: 'organizationName', value: razonSocial },
    { shortName: 'OU', value: ruc },
  ];
  certificado.setSubject(atributos);
  // Autofirmado: emisor y sujeto son el mismo.
  certificado.setIssuer(atributos);
  certificado.sign(par.privateKey, forge.md.sha256.create());

  return {
    clavePrivadaPem: forge.pki.privateKeyToPem(par.privateKey),
    certificadoPem: forge.pki.certificateToPem(certificado),
    validoHasta: certificado.validity.notAfter,
  };
}
