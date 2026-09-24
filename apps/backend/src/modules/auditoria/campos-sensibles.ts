/**
 * Campos que nunca deben quedar escritos en texto plano en la bitácora de auditoría.
 *
 * Único lugar de verdad de esta política — tanto `auditoria.middleware.ts` (redacción de
 * peticiones nuevas) como la migración de saneamiento histórico (`1789015000000-
 * SanearOseClaveAuditoriaHistorica.ts`) deben usar exactamente esta misma lista y esta misma
 * regla de normalización. Si divergen, un campo puede quedar protegido en las peticiones
 * nuevas pero sin sanear en el histórico (o viceversa) — ver H02 en
 * `docs/auditoria/BACKLOG-TECNICO.md`.
 *
 * Ya en su forma normalizada: minúsculas, sin `_` ni `-`.
 */
export const CAMPOS_SENSIBLES = [
  'password',
  'passwordactual',
  'passwordnuevo',
  /** Contraseña de usuario (login, cambio de contraseña) — y también, deliberadamente, la
   * contraseña del certificado PFX/P12 (`POST /facturacion/configuracion/certificado`, campo
   * multipart `contrasena` en `facturacion.controller.ts`). Hoy esa contraseña no llega a
   * `req.body` a tiempo de ser auditada por el orden de middlewares (multer corre después de
   * `auditoriaMiddleware`), pero esta entrada es la defensa explícita para que, si ese orden
   * cambiara en el futuro, el valor siga quedando redactado por este mismo nombre. No renombrar
   * el campo `contrasena` en el controlador de facturación sin actualizar esta lista.
   */
  'contrasena',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'claveprivada',
  /** Credencial del proveedor OSE (NubeFacT) — H02. */
  'oseclave',
];

export const REDACTADO = '[redactado]';

/**
 * Normaliza el nombre de una propiedad para compararlo contra `CAMPOS_SENSIBLES` sin depender
 * de cómo se escribió: minúsculas y sin separadores de palabra (`_`, `-`). Así `oseClave`,
 * `OSECLAVE`, `ose_clave` y `ose-clave` normalizan todas a `oseclave`.
 *
 * Deliberadamente NO hace nada más que esto. La comparación contra la lista sigue siendo de
 * IGUALDAD EXACTA (nunca `includes`/`startsWith`/`endsWith` ni una regex genérica): así
 * `tokenExpiraEn` (→ `tokenexpiraen`), `claveProducto` (→ `claveproducto`) y
 * `claveReferencia` (→ `clavereferencia`) no coinciden con ninguna entrada de la lista y jamás
 * se redactan por error.
 */
export function normalizarNombreCampo(nombre: string): string {
  return nombre.toLowerCase().replace(/[_-]/g, '');
}

/** Reemplaza recursivamente cualquier campo sensible por un marcador, conservando el resto de
 * la estructura para que el registro siga siendo útil. */
export function redactar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(redactar);
  if (valor === null || typeof valor !== 'object') return valor;

  return Object.fromEntries(
    Object.entries(valor as Record<string, unknown>).map(([clave, contenido]) => [
      clave,
      CAMPOS_SENSIBLES.includes(normalizarNombreCampo(clave)) ? REDACTADO : redactar(contenido),
    ]),
  );
}
