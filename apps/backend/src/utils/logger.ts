import { env } from '../config/env';

type Nivel = 'debug' | 'info' | 'warn' | 'error';

/** Datos adicionales que acompañan a un mensaje (ruta, empresa, duración…). */
export type Contexto = Record<string, unknown>;

const NIVELES: Record<Nivel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Bajo `LOG_LEVEL` se descarta todo lo menos importante. En pruebas solo pasan los errores:
 * el resto convertiría la salida de la suite en ruido ilegible. */
const nivelMinimo =
  NIVELES[(process.env.LOG_LEVEL as Nivel) ?? (env.nodeEnv === 'test' ? 'error' : 'info')] ??
  NIVELES.info;

const COLORES: Record<Nivel, string> = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};

/**
 * Serializa un error sin perder lo que importa. `JSON.stringify(error)` devuelve `{}` porque
 * `message` y `stack` no son enumerables — un descuido clásico que deja los registros de
 * producción con errores vacíos.
 */
function serializarError(error: unknown): Contexto {
  if (!(error instanceof Error)) return { error: String(error) };
  return {
    error: error.message,
    tipo: error.name,
    // La traza solo fuera de producción: en los registros de producción es ruido, y si el
    // servicio de registro es externo puede exponer rutas del servidor.
    ...(env.nodeEnv === 'production' ? {} : { traza: error.stack }),
  };
}

function emitir(nivel: Nivel, mensaje: string, contexto?: Contexto): void {
  if (NIVELES[nivel] < nivelMinimo) return;

  const salida = nivel === 'error' || nivel === 'warn' ? console.error : console.log;

  // En producción, una línea JSON por registro: es lo que cualquier agregador (el propio
  // panel del proveedor de hosting, o un Sentry/Datadog más adelante) sabe leer sin
  // configuración. En desarrollo prima que se lea de un vistazo.
  if (env.nodeEnv === 'production') {
    salida(JSON.stringify({ hora: new Date().toISOString(), nivel, mensaje, ...contexto }));
    return;
  }

  const extra = contexto && Object.keys(contexto).length > 0 ? ` ${JSON.stringify(contexto)}` : '';
  salida(`${COLORES[nivel]}${nivel.toUpperCase()}\x1b[0m ${mensaje}${extra}`);
}

/**
 * Registro de la aplicación.
 *
 * Es propio y no una librería (pino, winston) a propósito: lo único que hace falta acá es
 * emitir una línea JSON por evento, y eso cabe en este archivo. Si algún día se necesita
 * enviar los registros a un servicio externo, rotar archivos o muestrear, ese es el momento
 * de cambiar a `pino` — y este módulo es la única superficie que habría que reemplazar.
 *
 * Sustituye a los `console.log` sueltos: sin nivel, sin marca de tiempo y sin contexto, un
 * registro de producción no sirve para reconstruir qué pasó.
 */
export const logger = {
  debug: (mensaje: string, contexto?: Contexto) => emitir('debug', mensaje, contexto),
  info: (mensaje: string, contexto?: Contexto) => emitir('info', mensaje, contexto),
  warn: (mensaje: string, contexto?: Contexto) => emitir('warn', mensaje, contexto),
  error: (mensaje: string, error?: unknown, contexto?: Contexto) =>
    emitir('error', mensaje, { ...contexto, ...(error ? serializarError(error) : {}) }),
};
