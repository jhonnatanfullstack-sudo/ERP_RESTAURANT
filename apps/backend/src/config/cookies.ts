import { env } from './env';

/** Nombre de la cookie del refresh token. Única fuente: la usan el login, el alta de demo y
 * el cierre de sesión. */
export const REFRESH_COOKIE = 'refresh_token';

/**
 * Opciones de la cookie del refresh token.
 *
 * **`sameSite` es la decisión crítica al desplegar.** En desarrollo el frontend y el backend
 * viven en el mismo host (`localhost`), así que `lax` funciona. En producción es habitual
 * separarlos —el frontend como sitio estático en un CDN, el backend en otro dominio— y ahí
 * `lax` hace que el navegador **no envíe** la cookie en las peticiones al backend: el login
 * parece funcionar (el access token viaja en el cuerpo), pero al recargar la página la
 * renovación de sesión falla en silencio y el usuario aparece deslogueado en cada refresco.
 *
 * Para ese caso hace falta `sameSite: 'none'`, que el navegador solo acepta junto con
 * `secure: true` (es decir, HTTPS). Se controla con `COOKIE_CROSS_SITE=true` en vez de
 * deducirlo, porque el backend no tiene forma fiable de saber si el frontend está en su
 * mismo sitio. Ver `docs/despliegue.md`.
 */
export const opcionesCookieRefresh = {
  httpOnly: true,
  secure: env.cookies.crossSite || env.nodeEnv === 'production',
  sameSite: env.cookies.crossSite ? ('none' as const) : ('lax' as const),
  maxAge: env.jwt.refreshExpiresInMs,
  // Acotada a las rutas de autenticación: es el único lugar que la lee, y así no viaja en
  // cada petición a la API.
  path: '/api/auth',
};

/** Las mismas opciones que identifican la cookie al borrarla. El navegador solo elimina una
 * cookie si coinciden `path` y atributos; borrarla con opciones distintas la deja viva. */
export const opcionesBorrarCookieRefresh = {
  httpOnly: opcionesCookieRefresh.httpOnly,
  secure: opcionesCookieRefresh.secure,
  sameSite: opcionesCookieRefresh.sameSite,
  path: opcionesCookieRefresh.path,
};
