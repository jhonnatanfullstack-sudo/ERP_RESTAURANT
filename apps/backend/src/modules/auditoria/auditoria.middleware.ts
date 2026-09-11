import type { NextFunction, Request, Response } from 'express';
import { AccionAuditoria } from './registro-auditoria.entity';
import { registrarAuditoria } from './auditoria.service';
import { logger } from '../../utils/logger';

/**
 * Campos que nunca deben quedar escritos en la bitácora. La auditoría guarda el cuerpo de la
 * petición para poder reconstruir qué se hizo, y sin esta lista un `POST /auth/login` dejaría
 * la contraseña en claro dentro de la base de datos, a la vista de cualquiera que pueda leer
 * la auditoría. La comparación es en minúsculas para que no dependa de cómo se escribió.
 */
const CAMPOS_SENSIBLES = [
  'password',
  'passwordactual',
  'passwordnuevo',
  'contrasena',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'clavePrivada'.toLowerCase(),
];

const REDACTADO = '[redactado]';

/** Reemplaza recursivamente cualquier campo sensible por un marcador, conservando el resto
 * de la estructura para que el registro siga siendo útil. */
function redactar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(redactar);
  if (valor === null || typeof valor !== 'object') return valor;

  return Object.fromEntries(
    Object.entries(valor as Record<string, unknown>).map(([clave, contenido]) => [
      clave,
      CAMPOS_SENSIBLES.includes(clave.toLowerCase()) ? REDACTADO : redactar(contenido),
    ]),
  );
}

/** Primer segmento de la ruta bajo `/api`: `/api/ventas/123/anular` → `ventas`. */
function moduloDe(ruta: string): string {
  return ruta.replace(/^\/api\//, '').split('/')[0] || 'desconocido';
}

/** Segundo segmento cuando parece un identificador: `/api/ventas/<uuid>/anular` → el uuid. */
function recursoDe(ruta: string): string | null {
  const segmentos = ruta.replace(/^\/api\//, '').split('/');
  return segmentos[1] && segmentos[1].length >= 8 ? segmentos[1] : null;
}

function accionDe(metodo: string, ruta: string, estadoHttp: number): AccionAuditoria {
  if (ruta.endsWith('/login')) {
    return estadoHttp < 400 ? AccionAuditoria.LOGIN : AccionAuditoria.LOGIN_FALLIDO;
  }
  if (ruta.endsWith('/logout')) return AccionAuditoria.LOGOUT;
  if (ruta.endsWith('/anular')) return AccionAuditoria.ANULAR;
  if (metodo === 'DELETE') return AccionAuditoria.ELIMINAR;
  if (metodo === 'PUT' || metodo === 'PATCH') return AccionAuditoria.ACTUALIZAR;
  return AccionAuditoria.CREAR;
}

const METODOS_AUDITADOS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Registra en la bitácora toda petición que modifica datos. Las lecturas (`GET`) quedan fuera
 * a propósito: son la mayor parte del tráfico y llenarían la tabla sin aportar nada a una
 * auditoría, que existe para responder quién cambió qué.
 *
 * Se engancha al evento `finish` de la respuesta, es decir, después de que el cliente ya
 * recibió su resultado: así se conoce el código HTTP final y auditar no le suma latencia a la
 * operación. Si el registro falla, se traga el error — que la bitácora esté caída no puede
 * tumbar una venta.
 *
 * Como para entonces la transacción de la petición ya se confirmó y su conexión volvió al
 * pool, la escritura abre una conexión propia (`ejecutarFueraDeLaPeticion`). Reusar la de la
 * petición fallaba con "Driver not Connected", y como el error se traga, la bitácora quedaba
 * vacía sin que nada lo avisara. Una conexión aparte además es lo correcto: la entrada tiene
 * que sobrevivir aunque la operación auditada haya fallado y revertido.
 */
export function auditoriaMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!METODOS_AUDITADOS.has(req.method)) {
    next();
    return;
  }

  // El cuerpo se copia acá y no en `finish` porque algún controlador podría mutarlo.
  const cuerpo = req.body && typeof req.body === 'object' ? redactar(req.body) : null;

  res.on('finish', () => {
    const ruta = req.originalUrl.split('?')[0];
    void registrarAuditoria({
      usuarioId: req.usuarioAuth?.sub ?? null,
      empresaId: req.usuarioAuth?.empresaId ?? null,
      accion: accionDe(req.method, ruta, res.statusCode),
      modulo: moduloDe(ruta),
      recursoId: recursoDe(ruta),
      metodo: req.method,
      ruta,
      estadoHttp: res.statusCode,
      ip: req.ip ?? null,
      datos: cuerpo as Record<string, unknown> | null,
    }).catch((error: unknown) => {
      // Se reporta para no perder el fallo de vista, pero nunca se propaga.
      logger.error('No se pudo registrar en auditoría', error, { idTraza: req.idTraza });
    });
  });

  next();
}
