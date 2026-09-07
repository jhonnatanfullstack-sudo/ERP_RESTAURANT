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

## Usuario administrador de arranque

Sembrado por la migración `SeedRbacInicial` (ver `base-de-datos.md`):

- Email: `admin@restaurant.local`
- Contraseña temporal: `CambiarInmediatamente123!`

**Cambiar esta contraseña inmediatamente** desde "Cambiar contraseña" en la barra superior tras el primer login, y editar los datos de la empresa placeholder (RUC `20000000001`, "Empresa Demo S.A.C.") desde el módulo Empresa.
