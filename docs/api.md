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

| Método              | Ruta                                                                                 | Auth                       | Descripción                                                                         |
| ------------------- | ------------------------------------------------------------------------------------ | -------------------------- | ----------------------------------------------------------------------------------- |
| GET                 | `/health`                                                                            | No                         | Estado del servidor                                                                 |
| POST                | `/api/auth/login`                                                                    | No                         | Iniciar sesión                                                                      |
| POST                | `/api/auth/refresh`                                                                  | No (cookie)                | Renovar access token                                                                |
| POST                | `/api/auth/logout`                                                                   | No                         | Cerrar sesión                                                                       |
| GET                 | `/api/auth/me`                                                                       | Sí                         | Usuario autenticado actual                                                          |
| POST                | `/api/auth/cambiar-password`                                                         | Sí                         | Cambiar contraseña propia                                                           |
| GET/POST/PUT        | `/api/empresas`, `/api/empresas/:id`                                                 | Sí + `empresa.*`           | CRUD de empresa                                                                     |
| GET/POST/PUT/DELETE | `/api/personal`, `/api/personal/:id`                                                 | Sí + `personal.*`          | CRUD de personal (DELETE = desactivar)                                              |
| GET/POST/PUT/DELETE | `/api/usuarios`, `/api/usuarios/:id`                                                 | Sí + `usuarios.*`          | CRUD de usuarios (DELETE = desactivar)                                              |
| GET/POST/PUT/DELETE | `/api/roles`, `/api/roles/:id`, `/api/roles/:id/permisos`                            | Sí + `roles.*`             | CRUD de roles y asignación de permisos (DELETE = borrado real)                      |
| GET                 | `/api/permisos`                                                                      | Sí + `permisos.ver`        | Catálogo de permisos                                                                |
| GET                 | `/api/catalogos/tipos-documento-identidad`, `/tipos-comprobante`, `/unidades-medida` | Sí (cualquier autenticado) | Catálogos SUNAT                                                                     |
| GET                 | `/api/personal/consulta-documento?tipo=dni\|ruc&numero=...`                          | Sí + `personal.crear`      | Autocompleta nombres desde RENIEC/SUNAT (ver abajo)                                 |
| GET/POST/PUT/DELETE | `/api/categorias`, `/api/categorias/:id`                                             | Sí + `categorias.*`        | CRUD de categorías de la carta (DELETE = bloqueado si tiene productos)              |
| GET/POST/PUT/DELETE | `/api/marcas`, `/api/marcas/:id`                                                     | Sí + `marcas.*`            | CRUD de marcas de producto (DELETE = bloqueado si tiene productos)                  |
| GET/POST/PUT/DELETE | `/api/productos`, `/api/productos/:id`                                               | Sí + `productos.*`         | CRUD de productos (DELETE = borrado real, elimina la foto)                          |
| POST                | `/api/productos/:id/imagen`                                                          | Sí + `productos.editar`    | Sube/reemplaza la foto del producto (`multipart/form-data`, campo `imagen`)         |
| GET                 | `/api/productos/publico`                                                             | No                         | Productos activos de categorías activas, para la carta pública                      |
| GET/POST/PUT/DELETE | `/api/salones`, `/api/salones/:id`                                                   | Sí + `salones.*`           | CRUD de salones (DELETE = bloqueado si tiene mesas)                                 |
| GET/POST/PUT/DELETE | `/api/mesas`, `/api/mesas/:id`                                                       | Sí + `mesas.*`             | CRUD de mesas (único `numero` por salón, DELETE = borrado real)                     |
| GET/POST/PUT/DELETE | `/api/clientes`, `/api/clientes/:id`                                                 | Sí + `clientes.*`          | CRUD de clientes (DELETE = desactivar; documento/email únicos si se dan)            |
| GET                 | `/api/clientes/consulta-documento?tipo=dni\|ruc&numero=...`                          | Sí + `clientes.crear`      | Autocompleta nombres desde RENIEC/SUNAT para Clientes (mismo servicio que Personal) |
| GET/POST/PUT/DELETE | `/api/reservas`, `/api/reservas/:id`                                                 | Sí + `reservas.*`          | CRUD de reservas de mesa (DELETE = cancelar, ver reglas de negocio abajo)           |
| GET/POST/PUT/DELETE | `/api/pedidos`, `/api/pedidos/:id`                                                   | Sí + `pedidos.*`           | CRUD de pedidos de mesa (DELETE = cancelar, ver reglas de negocio abajo)            |
| POST/PUT/DELETE     | `/api/pedidos/:id/detalles`, `/api/pedidos/:id/detalles/:detalleId`                  | Sí + `pedidos.editar`      | Agregar/editar/quitar líneas de producto de un pedido abierto                       |

Detalle completo de request/response de auth y roles en `autenticacion.md` y `roles-y-permisos.md`. El resto de rutas de negocio se van agregando módulo por módulo a partir de FASE 13.

### Reservas de mesa (FASE 11.5)

- **Reglas de negocio** (`reserva.service.ts`): el cliente y la mesa deben existir y estar activos; `cantidadPersonas` no puede exceder `mesa.capacidad`; `fechaHora` debe ser futura; y no puede haber otra reserva **pendiente o confirmada** para la misma mesa cuyo rango `[fechaHora, fechaHora + duracionMinutos)` se solape con el nuevo — el solape se calcula con una condición SQL sobre `fecha_hora` y `duracion_minutos` (`reserva.fecha_hora + (duracion_minutos || ' minutes')::interval > :inicio`), no en memoria.
- **Estados** (`estado`, enum de Postgres): `pendiente` (por defecto) → `confirmada` → `completada`, o `cancelada` desde pendiente/confirmada. `DELETE /api/reservas/:id` es azúcar sintáctica para "poner `estado = cancelada`" (mismo patrón de borrado lógico que Personal/Usuarios/Clientes, aplicado aquí al ciclo de vida de la reserva en vez de a un campo `activo`).
- Body de `POST`/`PUT`: `clienteId`, `mesaId`, `fechaHora` (ISO 8601 **con offset/zulu**, ej. `2026-09-09T19:00:00.000Z` — ver nota de frontend abajo), `duracionMinutos` (opcional, default 90), `cantidadPersonas`, `notas` (opcional), y en `PUT` también `estado`.

### Pedidos de mesa (FASE 12)

- **Alcance de esta fase**: un `Pedido` es la orden de una mesa mientras se atiende (Pedidos + Detalle de pedidos, sección 1 de `CLAUDE.md`). Los estados de cocina/comanda (FASE 13) y el cobro/pago (FASE 14, Ventas) son fases futuras separadas y **no** se adelantan aquí — `estado` de Pedido solo modela "abierto → cerrado" o "abierto → cancelado", sin pasos intermedios de preparación.
- **Estados** (`estado`, enum de Postgres): `abierto` (por defecto, al crear) → `cerrado` (ya no admite cambios; lo hará FASE 14 al facturar), o `cancelado` desde `abierto`. `DELETE /api/pedidos/:id` es azúcar sintáctica para "cancelar" (mismo patrón que Reservas).
- **Reglas de negocio** (`pedido.service.ts`):
  - La mesa debe existir y estar activa; no puede haber **dos pedidos `abierto` simultáneos para la misma mesa** (409 si ya hay uno).
  - Un pedido solo admite agregar/editar/quitar líneas de detalle mientras está `abierto` (400 en cualquier otro estado).
  - No se puede pasar a `cerrado` sin al menos 1 línea de detalle (400).
  - Cada línea (`DetallePedido`) guarda un **snapshot del precio del producto** al momento de agregarla (`precioUnitario`) — si el precio del producto cambia después, no afecta pedidos ya creados. `subtotal = cantidad × precioUnitario`, recalculado en cada cambio de cantidad; `Pedido.total` se recalcula sumando todos los `subtotal` cada vez que una línea se agrega, edita o quita.
  - El producto de una línea debe existir y estar activo al momento de agregarla.
- Body de `POST /api/pedidos`: `mesaId`, `notas` (opcional). `PUT /api/pedidos/:id`: `notas` y/o `estado` (solo transición `abierto→cerrado` permitida por esta vía; `cancelado` va por `DELETE`).
- Body de `POST /api/pedidos/:id/detalles`: `productoId`, `cantidad`, `notas` (opcional). `PUT .../detalles/:detalleId`: `cantidad` y/o `notas`.
- Rutas anidadas: `validateUuidParam(nombre)` (nuevo en `validate.middleware.ts`) valida un parámetro de ruta distinto de `id` (ej. `detalleId`), complementando a `validateIdParam` que solo cubre `id`.
- **Bug real encontrado y corregido (E2E, 2026-09-08):** `obtenerPedido` no ordenaba explícitamente `detalles` al consultarlos — Postgres no garantiza el orden de un `SELECT` sin `ORDER BY`, y tras un `UPDATE` una fila editada puede devolverse en una posición distinta a la de inserción aunque su `creado_en` no cambie. Esto hacía que las líneas del pedido "saltaran" de lugar en la tabla del frontend al editar una cantidad. Fix: `pedido.service.ts` ordena `pedido.detalles` por `creadoEn` ascendente en memoria antes de devolver el pedido.

### Archivos subidos (imágenes de producto)

- Middleware: `multer` (disco), configurado en `src/config/uploads.ts`. Solo acepta `image/*` con extensión `.jpg/.jpeg/.png/.webp`, máximo 5 MB; nombre de archivo generado con UUID (nunca se confía en el nombre original).
- Almacenamiento: `apps/backend/uploads/<subcarpeta>/` (fuera de git, ver `.gitignore`). Servido estáticamente en `GET /uploads/...` con `Cross-Origin-Resource-Policy: cross-origin` (necesario porque Helmet por defecto bloquea la carga cross-origin de la imagen desde el frontend en otro puerto).
- Al reemplazar o eliminar un producto, el archivo anterior se borra del disco (`producto.service.ts`) para no acumular huérfanos.
- Errores de Multer (tamaño excedido, tipo no permitido) se traducen a `400` en `error-handler.middleware.ts`, no a `500`.

### Consulta de DNI/RUC (RENIEC/SUNAT)

- Proveedor: **apis.net.pe** (decisión del usuario, 2026-09-07). Un solo token cubre DNI (RENIEC) y RUC (SUNAT).
- Configuración: variable de entorno `APIS_NET_PE_TOKEN` (ver `.env.example`). **Opcional** — si no está configurada, el endpoint responde `503` con un mensaje claro y el resto del sistema sigue funcionando con normalidad; no bloquea el arranque del backend.
- Implementación: `src/modules/catalogos/consulta-documento.service.ts` (movido desde `personal/` el 2026-09-07 cuando Clientes empezó a necesitar la misma búsqueda — vive en `catalogos` por ser una integración SUNAT compartida, no algo específico de Personal), usando `fetch` nativo de Node (sin dependencia nueva), con timeout de 8s. La validación de formato por tipo de documento (`FORMATOS_DOCUMENTO`) vive en `src/modules/catalogos/formato-documento.util.ts`, también compartida entre Personal y Clientes.
- Frontend: botón de búsqueda (icono lupa) junto al campo "N° de documento", componente compartido `components/CampoBusquedaDocumento.tsx` (genérico sobre el tipo de formulario vía generics de react-hook-form), usado en los formularios de crear/editar de Personal y Clientes. Visible solo cuando el tipo de documento elegido es DNI o RUC (los únicos que `apis.net.pe` puede consultar). Autocompleta nombres y apellidos; cada página decide cómo mapear el resultado a sus propios campos (Personal separa apellido paterno/materno, Clientes los concatena en un solo campo `apellidos`).
- **IMPORTANTE (corregido 2026-09-07):** apis.net.pe migró su servicio a la infraestructura de **Decolecta** — el dominio/versión vigentes son `https://api.decolecta.com/v1` (no `api.apis.net.pe/v2`), con un esquema de campos distinto (`document_number/first_name/first_last_name/second_last_name` para DNI; `numero_documento/razon_social` para RUC). El código y el `.env.example` ya apuntan al dominio correcto. Si en el futuro la búsqueda vuelve a fallar con "Token inválido" pese a tener un token vigente, sospechar primero de otro cambio de dominio/contrato del proveedor — probar con `curl` contra la URL configurada antes de asumir que es un bug del código.

## Cómo correr el backend

```bash
pnpm --filter @restaurant-erp/backend dev    # desarrollo, con recarga automática
pnpm --filter @restaurant-erp/backend build  # compila a dist/
pnpm --filter @restaurant-erp/backend start  # ejecuta dist/server.js (requiere build previo)
```
