# Autenticación

## Flujo (FASE 7)

- **Access token**: JWT firmado (`JWT_ACCESS_SECRET`), vida corta (`JWT_ACCESS_EXPIRES_IN`, por defecto 15m). Se devuelve en el cuerpo de la respuesta de login/refresh y se envía en cada request como `Authorization: Bearer <token>`. Nunca se persiste en base de datos.
- **Refresh token**: JWT firmado (`JWT_REFRESH_SECRET`), vida larga (`JWT_REFRESH_EXPIRES_IN`, por defecto 7d). Se entrega como cookie **httpOnly** (`refresh_token`, `path=/api/auth`), nunca accesible desde JavaScript del navegador. Se guarda un **hash SHA-256** del token en la tabla `refresh_tokens` para poder revocarlo; nunca se guarda el token en texto plano.
- **Rotación**: cada `POST /api/auth/refresh` revoca el refresh token usado y emite uno nuevo (rotación de un solo uso).

## Endpoints

| Método | Ruta                         | Body                                | Auth                        | Descripción                                                                               |
| ------ | ---------------------------- | ----------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------- |
| POST   | `/api/auth/login`            | `{ email, password }`               | No                          | Rate limit propio (10/15min). Devuelve `accessToken` + `usuario`, setea cookie de refresh |
| POST   | `/api/auth/refresh`          | — (usa cookie)                      | No (requiere cookie válida) | Rota el refresh token, devuelve nuevo `accessToken`                                       |
| POST   | `/api/auth/logout`           | —                                   | No                          | Revoca el refresh token y limpia la cookie                                                |
| GET    | `/api/auth/me`               | —                                   | Sí                          | Devuelve el usuario autenticado actual                                                    |
| POST   | `/api/auth/cambiar-password` | `{ passwordActual, passwordNuevo }` | Sí                          | Cambia la contraseña del usuario autenticado                                              |

## Middlewares

- `requireAuth` (`src/middlewares/auth.middleware.ts`): valida el `accessToken` del header `Authorization`, adjunta `req.usuarioAuth = { sub, rol, permisos }`.
- `requirePermission(codigo)`: exige que `req.usuarioAuth.permisos` incluya el código exacto (ej. `usuarios.crear`). Se aplica por ruta, no por rol — cumple la sección 10 de `CLAUDE.md` ("no depender únicamente del nombre del rol").

## Frontend

- `src/context/AuthContext.tsx`: al montar la app, intenta `POST /api/auth/refresh` (usa la cookie httpOnly) para restaurar sesión tras recargar la página. Expone `login`, `logout`, `tienePermiso(codigo)`.
- `src/services/api.ts`: instancia de Axios con interceptor que adjunta el `accessToken` en memoria, y ante un `401` intenta refrescar una vez antes de fallar.
- `src/routes/ProtectedRoute.tsx`: redirige a `/login` si no hay sesión.
- El `accessToken` se mantiene solo en memoria (no en `localStorage`), reduciendo superficie de robo por XSS; sobrevive a recargas gracias al refresh silencioso vía cookie httpOnly.

## Problema conocido, sin corregir (encontrado en E2E de FASE 13, 2026-09-08)

El `useEffect` de `AuthContext` que llama a `authService.refrescar()` al montar la app no cancela ni ignora una respuesta obsoleta si el efecto se dispara más de una vez. En desarrollo, React StrictMode monta cada efecto dos veces adrede, así que al cargar la app se disparan **dos** `POST /api/auth/refresh` casi simultáneos usando la misma cookie de refresh token; como la rotación es de un solo uso (ver arriba), una de las dos peticiones puede fallar con 401 porque la otra ya rotó el token primero — y según el orden en que resuelvan las promesas, el usuario puede terminar deslogueado pese a tener una sesión válida. Se reprodujo de forma consistente recargando la página completa (`F5`) durante pruebas E2E; navegar dentro de la SPA (sin recargar) no lo dispara. No se corrigió en esta sesión por ser una fase distinta (FASE 7 ya cerrada) y tocar el flujo de sesión — pendiente de que el usuario decida si se agenda como fix independiente. Fix probable: usar una bandera/`AbortController` en el efecto para ignorar el resultado de una llamada si el componente ya se desmontó/remontó, patrón estándar para efectos de datos en React con StrictMode.

## Usuario administrador de arranque

Sembrado por la migración `SeedRbacInicial` (ver `base-de-datos.md`):

- Email: `admin@restaurant.local`
- Contraseña temporal: `CambiarInmediatamente123!`

**Cambiar esta contraseña inmediatamente** desde "Cambiar contraseña" en la barra superior tras el primer login, y editar los datos de la empresa placeholder (RUC `20000000001`, "Empresa Demo S.A.C.") desde el módulo Empresa.

## Rotación obligatoria de contraseña (H01, `docs/auditoria/BACKLOG-TECNICO.md`)

Mientras `usuarios.debe_cambiar_password` sea `true` (lo que trae la cuenta de arranque hasta que se rote), la sesión puede iniciar sesión con normalidad, pero `requireAuth` rechaza con **`428 Precondition Required`** (código `DEBE_CAMBIAR_PASSWORD` en el body) cualquier ruta que no sea `POST /api/auth/cambiar-password`, `POST /api/auth/logout` o `GET /api/auth/me`. `POST /api/auth/cambiar-password` exige además que la contraseña nueva sea distinta de la actual (comparada con `bcrypt.compare`, nunca en texto plano). Una vez rotada, `debe_cambiar_password` pasa a `false` en la misma operación y la sesión ya emitida recupera acceso normal sin volver a iniciar sesión (el chequeo se lee de la base en cada petición, no del JWT). **Esta cuenta nunca es proveedor de la plataforma automáticamente** — ver `roles-y-permisos.md` para el procedimiento real de asignación. La misma verificación se aplica al conectar por Socket.IO (`realtime/socket.ts`): un JWT válido ya no basta, se relee el estado real del usuario en la base.

**Límite conocido (H01-R07, diferido a H06):** cambiar la contraseña, o que a un usuario le fijen `debe_cambiar_password = true`, no invalida las sesiones (access token en memoria, refresh token en cookie) que ya se emitieron antes de ese momento — siguen siendo válidas hasta que expiren por su cuenta. Las sesiones existentes antes del cambio de contraseña permanecen válidas; seguimiento en H06 (no se introduce todavía `tokenVersion`, revocación global de refresh tokens, ni un rediseño de sesiones — eso pertenece a esa corrección, no a H01).
