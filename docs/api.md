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

| Método              | Ruta                                                             | Auth                       | Descripción                                                    |
| ------------------- | ---------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------- |
| GET                 | `/health`                                                        | No                         | Estado del servidor                                            |
| POST                | `/api/auth/login`                                                | No                         | Iniciar sesión                                                 |
| POST                | `/api/auth/refresh`                                              | No (cookie)                | Renovar access token                                           |
| POST                | `/api/auth/logout`                                               | No                         | Cerrar sesión                                                  |
| GET                 | `/api/auth/me`                                                   | Sí                         | Usuario autenticado actual                                     |
| POST                | `/api/auth/cambiar-password`                                     | Sí                         | Cambiar contraseña propia                                      |
| GET/POST/PUT        | `/api/empresas`, `/api/empresas/:id`                             | Sí + `empresa.*`           | CRUD de empresa                                                |
| GET/POST/PUT/DELETE | `/api/personal`, `/api/personal/:id`                             | Sí + `personal.*`          | CRUD de personal (DELETE = desactivar)                         |
| GET/POST/PUT/DELETE | `/api/usuarios`, `/api/usuarios/:id`                             | Sí + `usuarios.*`          | CRUD de usuarios (DELETE = desactivar)                         |
| GET/POST/PUT/DELETE | `/api/roles`, `/api/roles/:id`, `/api/roles/:id/permisos`        | Sí + `roles.*`             | CRUD de roles y asignación de permisos (DELETE = borrado real) |
| GET                 | `/api/permisos`                                                  | Sí + `permisos.ver`        | Catálogo de permisos                                           |
| GET                 | `/api/catalogos/tipos-documento-identidad`, `/tipos-comprobante` | Sí (cualquier autenticado) | Catálogos SUNAT                                                |
| GET                 | `/api/personal/consulta-documento?tipo=dni\|ruc&numero=...`      | Sí + `personal.crear`      | Autocompleta nombres desde RENIEC/SUNAT (ver abajo)            |
| GET/POST/PUT/DELETE | `/api/categorias`, `/api/categorias/:id`                        | Sí + `categorias.*`        | CRUD de categorías de la carta (DELETE = borrado real)         |
| GET/POST/PUT/DELETE | `/api/productos`, `/api/productos/:id`                          | Sí + `productos.*`         | CRUD de productos (DELETE = borrado real, elimina la foto)     |
| POST                | `/api/productos/:id/imagen`                                      | Sí + `productos.editar`    | Sube/reemplaza la foto del producto (`multipart/form-data`, campo `imagen`) |
| GET                 | `/api/productos/publico`                                        | No                         | Productos activos de categorías activas, para la carta pública |

Detalle completo de request/response de auth y roles en `autenticacion.md` y `roles-y-permisos.md`. El resto de rutas de negocio se van agregando módulo por módulo a partir de FASE 10.

### Archivos subidos (imágenes de producto)

- Middleware: `multer` (disco), configurado en `src/config/uploads.ts`. Solo acepta `image/*` con extensión `.jpg/.jpeg/.png/.webp`, máximo 5 MB; nombre de archivo generado con UUID (nunca se confía en el nombre original).
- Almacenamiento: `apps/backend/uploads/<subcarpeta>/` (fuera de git, ver `.gitignore`). Servido estáticamente en `GET /uploads/...` con `Cross-Origin-Resource-Policy: cross-origin` (necesario porque Helmet por defecto bloquea la carga cross-origin de la imagen desde el frontend en otro puerto).
- Al reemplazar o eliminar un producto, el archivo anterior se borra del disco (`producto.service.ts`) para no acumular huérfanos.
- Errores de Multer (tamaño excedido, tipo no permitido) se traducen a `400` en `error-handler.middleware.ts`, no a `500`.

### Consulta de DNI/RUC (RENIEC/SUNAT)

- Proveedor: **apis.net.pe** (decisión del usuario, 2026-09-07). Un solo token cubre DNI (RENIEC) y RUC (SUNAT).
- Configuración: variable de entorno `APIS_NET_PE_TOKEN` (ver `.env.example`). **Opcional** — si no está configurada, el endpoint responde `503` con un mensaje claro y el resto del sistema sigue funcionando con normalidad; no bloquea el arranque del backend.
- Implementación: `src/modules/personal/consulta-documento.service.ts`, usando `fetch` nativo de Node (sin dependencia nueva), con timeout de 8s.
- Frontend: botón de búsqueda (icono lupa) junto al campo "N° de documento" en el formulario de crear Personal, visible solo cuando el tipo de documento elegido es DNI o RUC. Autocompleta nombres/apellidos.
- **IMPORTANTE (corregido 2026-09-07):** apis.net.pe migró su servicio a la infraestructura de **Decolecta** — el dominio/versión vigentes son `https://api.decolecta.com/v1` (no `api.apis.net.pe/v2`), con un esquema de campos distinto (`document_number/first_name/first_last_name/second_last_name` para DNI; `numero_documento/razon_social` para RUC). El código y el `.env.example` ya apuntan al dominio correcto. Si en el futuro la búsqueda vuelve a fallar con "Token inválido" pese a tener un token vigente, sospechar primero de otro cambio de dominio/contrato del proveedor — probar con `curl` contra la URL configurada antes de asumir que es un bug del código.

## Cómo correr el backend

```bash
pnpm --filter @restaurant-erp/backend dev    # desarrollo, con recarga automática
pnpm --filter @restaurant-erp/backend build  # compila a dist/
pnpm --filter @restaurant-erp/backend start  # ejecuta dist/server.js (requiere build previo)
```
