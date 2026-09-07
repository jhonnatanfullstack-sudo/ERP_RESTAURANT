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
