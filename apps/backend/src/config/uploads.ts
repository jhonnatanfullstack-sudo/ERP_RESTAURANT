import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import multer from 'multer';
import { HttpError } from '../utils/http-error';

export const UPLOADS_DIR = join(__dirname, '../../uploads');

const EXTENSIONES_PERMITIDAS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function crearAlmacenamiento(subcarpeta: string) {
  const destino = join(UPLOADS_DIR, subcarpeta);
  if (!existsSync(destino)) {
    mkdirSync(destino, { recursive: true });
  }

  return multer.diskStorage({
    destination: destino,
    filename: (_req, archivo, callback) => {
      callback(null, `${randomUUID()}${extname(archivo.originalname).toLowerCase()}`);
    },
  });
}

export function crearUploaderImagen(subcarpeta: string) {
  return multer({
    storage: crearAlmacenamiento(subcarpeta),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, archivo, callback) => {
      const extensionValida = EXTENSIONES_PERMITIDAS.has(
        extname(archivo.originalname).toLowerCase(),
      );
      if (!extensionValida || !archivo.mimetype.startsWith('image/')) {
        callback(new HttpError(400, 'Formato de imagen no permitido (usar jpg, png o webp)'));
        return;
      }
      callback(null, true);
    },
  });
}

const EXTENSIONES_CERTIFICADO = new Set(['.pfx', '.p12']);

/**
 * Certificado digital (`.pfx`/`.p12`) del módulo de facturación electrónica (FASE 28).
 *
 * A diferencia de `crearUploaderImagen`, usa `memoryStorage`: el archivo llega en
 * `req.file.buffer` y **nunca toca el disco**. Es la clave privada tributaria de la empresa —
 * se cifra (`utils/cifrado.ts`) apenas se guarda en `configuraciones_facturacion` y el buffer
 * original se descarta con la petición.
 */
export const uploaderCertificado = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, archivo, callback) => {
    if (!EXTENSIONES_CERTIFICADO.has(extname(archivo.originalname).toLowerCase())) {
      callback(new HttpError(400, 'El certificado debe ser un archivo .pfx o .p12'));
      return;
    }
    callback(null, true);
  },
});
