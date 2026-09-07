# API

## Formato de respuesta

Todas las respuestas de la API siguen un formato consistente (sección 7 de `CLAUDE.md`):

**Éxito:**

```json
{ "success": true, "message": "OK", "data": {} }
```

**Error:**

```json
{ "success": false, "message": "...", "details": [] }
```

Helpers en `src/utils/api-response.ts`: `sendSuccess(res, data, message?, statusCode?)` y `sendError(res, statusCode, message, details?)`. Usar siempre estos helpers en los controladores, no construir la respuesta a mano.

## Manejo de errores

- `src/utils/http-error.ts`: clase `HttpError(statusCode, message, details?)` para errores de negocio/validación conocidos. Lanzarla desde services/controllers; el middleware de errores la traduce automáticamente al formato de la API.
- `src/middlewares/error-handler.middleware.ts`: middleware centralizado (último en la cadena). Los errores no controlados (`Error` genérico) devuelven 500 con mensaje genérico en producción, y el mensaje real solo en `NODE_ENV=development`. Nunca se expone el stack trace al cliente.
- `src/middlewares/not-found.middleware.ts`: responde 404 con el formato estándar para rutas no registradas.

## Seguridad aplicada (FASE 3)

- **Helmet**: cabeceras de seguridad por defecto (`X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, etc.).
- **CORS**: origen restringido a `CORS_ORIGIN` (env), con credenciales habilitadas (necesario para el futuro flujo de refresh token).
- **Rate limiting**: 300 solicitudes / 15 min por IP, aplicado globalmente; `/api/auth/login` tiene su propio límite más estricto (10/15min). Los endpoints públicos (carta, futuros) llevarán un límite propio cuando se implementen (FASE 8-9).
- **Body parser**: `express.json()` con límite de 1MB.
- **Validación**: `zod` en `src/middlewares/validate.middleware.ts` (`validateBody`, `validateIdParam`). Todo endpoint que recibe body o `:id` valida antes de llegar al controller.
- **Autenticación/autorización**: `requireAuth` + `requirePermission(codigo)` (`src/middlewares/auth.middleware.ts`). Ver `autenticacion.md` y `roles-y-permisos.md`.

## Endpoints existentes

| Método       | Ruta                                                             | Auth                       | Descripción                            |
| ------------ | ---------------------------------------------------------------- | -------------------------- | -------------------------------------- |
| GET          | `/health`                                                        | No                         | Estado del servidor                    |
| POST         | `/api/auth/login`                                                | No                         | Iniciar sesión                         |
| POST         | `/api/auth/refresh`                                              | No (cookie)                | Renovar access token                   |
| POST         | `/api/auth/logout`                                               | No                         | Cerrar sesión                          |
| GET          | `/api/auth/me`                                                   | Sí                         | Usuario autenticado actual             |
| POST         | `/api/auth/cambiar-password`                                     | Sí                         | Cambiar contraseña propia              |
| GET/POST/PUT | `/api/empresas`, `/api/empresas/:id`                             | Sí + `empresa.*`           | CRUD de empresa                        |
| GET/POST/PUT | `/api/personal`, `/api/personal/:id`                             | Sí + `personal.*`          | CRUD de personal                       |
| GET/POST/PUT | `/api/usuarios`, `/api/usuarios/:id`                             | Sí + `usuarios.*`          | CRUD de usuarios                       |
| GET/POST/PUT | `/api/roles`, `/api/roles/:id`, `/api/roles/:id/permisos`        | Sí + `roles.*`             | CRUD de roles y asignación de permisos |
| GET          | `/api/permisos`                                                  | Sí + `permisos.ver`        | Catálogo de permisos                   |
| GET          | `/api/catalogos/tipos-documento-identidad`, `/tipos-comprobante` | Sí (cualquier autenticado) | Catálogos SUNAT                        |

Detalle completo de request/response de auth y roles en `autenticacion.md` y `roles-y-permisos.md`. El resto de rutas de negocio se van agregando módulo por módulo a partir de FASE 8.

## Cómo correr el backend

```bash
pnpm --filter @restaurant-erp/backend dev    # desarrollo, con recarga automática
pnpm --filter @restaurant-erp/backend build  # compila a dist/
pnpm --filter @restaurant-erp/backend start  # ejecuta dist/server.js (requiere build previo)
```
