import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config/env';
import { HttpError } from './http-error';

const ALGORITMO = 'aes-256-gcm';
const LARGO_IV = 12;
const LARGO_TAG = 16;

/**
 * Cifrado en reposo para secretos por empresa (certificado digital, credenciales del OSE —
 * FASE 28). No existe nada equivalente en el proyecto: hasta ahora todo lo sensible (JWT,
 * contraseñas de BD) vivía en variables de entorno, nunca en una fila que un volcado de la
 * base pudiera exponer en texto plano.
 *
 * Formato guardado: `iv (12 bytes) || authTag (16 bytes) || texto cifrado`, todo en un único
 * `Buffer` — así una fila de la base solo necesita una columna `bytea`, no tres.
 */
function clave(): Buffer {
  if (!env.cifrado.claveBase64) {
    throw new HttpError(
      503,
      'La facturación electrónica no está disponible: falta configurar CIFRADO_CLAVE en el servidor',
    );
  }
  const buffer = Buffer.from(env.cifrado.claveBase64, 'base64');
  if (buffer.length !== 32) {
    throw new HttpError(
      503,
      'CIFRADO_CLAVE está mal configurada: debe decodificar a 32 bytes (AES-256)',
    );
  }
  return buffer;
}

export function cifrar(datos: Buffer | string): Buffer {
  const iv = randomBytes(LARGO_IV);
  const cifrador = createCipheriv(ALGORITMO, clave(), iv);
  const texto = Buffer.isBuffer(datos) ? datos : Buffer.from(datos, 'utf8');
  const cifrado = Buffer.concat([cifrador.update(texto), cifrador.final()]);
  return Buffer.concat([iv, cifrador.getAuthTag(), cifrado]);
}

export function descifrar(datos: Buffer): Buffer {
  const iv = datos.subarray(0, LARGO_IV);
  const authTag = datos.subarray(LARGO_IV, LARGO_IV + LARGO_TAG);
  const cifrado = datos.subarray(LARGO_IV + LARGO_TAG);
  const descifrador = createDecipheriv(ALGORITMO, clave(), iv);
  descifrador.setAuthTag(authTag);
  return Buffer.concat([descifrador.update(cifrado), descifrador.final()]);
}

export function descifrarTexto(datos: Buffer): string {
  return descifrar(datos).toString('utf8');
}
