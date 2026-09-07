# Estado del proyecto

**Última actualización:** 2026-09-07. Este documento es el punto de entrada para retomar el trabajo en una sesión nueva — léelo primero.

## Resumen ejecutivo

- **Fases completadas:** 0 a 11.5 (monorepo, base de datos con núcleo Empresa→Personal→Usuario y catálogos SUNAT, backend Express, frontend React, Usuarios/Roles-Permisos/Autenticación JWT, Categorías, Productos con fotos + Marcas + Unidad de Medida SUNAT + carta pública real, Salones/Mesas, Clientes acoplado a SUNAT, y Reservas de mesa). Todo probado de punta a punta en navegador real (Playwright).
- **Modo de avance:** el usuario autorizó avanzar de fase en fase sin pedir confirmación ("CONTINUAR") en cada una, siempre validando que no haya errores. Ver `plan-fases.md` → sección "Modo de avance".
- **El sistema ya es usable de extremo a extremo**: se puede iniciar sesión, crear personal/usuarios/roles, crear categorías/marcas y productos con foto y unidad de medida, y la carta pública (`/carta`, sin login) ya muestra productos reales agrupados por categoría.
- **Decisión de alcance (2026-09-07):** el usuario pidió que "el sistema sea completo" e insinuó adelantar Insumos/Recetas (mezcla de ingredientes con cantidades por platillo) ahora mismo. Se le explicó que eso vive en FASE 16 (Inventario) + FASE 18 (Recetas), con manejo de stock/compras/kardex, y **eligió seguir el orden original del plan** — no construir Insumos/Recetas todavía. En su lugar se ampliaron Categorías/Productos con lo que sí correspondía ahora: Marcas y Unidad de Medida SUNAT, más un sidebar con submenús preparado para los grupos que faltan (Ventas, Pedidos, Inventario, etc.). Ver `decisiones-tecnicas.md`.
- **Diseño visual:** se acordó con el usuario elevar el estándar visual **módulo por módulo** (no un rediseño transversal único) — fotos con efectos hover en vez de 3D real. Ver `decisiones-tecnicas.md` → "Diseño visual: fotos con efectos en vez de 3D real". Los módulos anteriores a FASE 9 (Usuarios/Personal/Roles/Empresa) siguen con el diseño de tabla simple y quedan pendientes de esa misma mejora visual cuando se retomen.

## Cómo retomar el entorno

```bash
# 1. Instalar dependencias
pnpm install

# 2. Levantar PostgreSQL (Docker Desktop debe estar corriendo)
docker compose up -d
docker inspect restaurant_erp_postgres --format '{{.State.Health.Status}}'  # debe decir "healthy"

# 3. Verificar migraciones aplicadas (deben ser 20)
pnpm --filter @restaurant-erp/backend migration:show

# 4. Validar que todo compila/lint limpio antes de seguir
pnpm lint
pnpm format:check
pnpm --filter @restaurant-erp/backend typecheck && pnpm --filter @restaurant-erp/backend build
pnpm --filter @restaurant-erp/frontend typecheck && pnpm --filter @restaurant-erp/frontend build

# 5. Levantar ambos servidores de desarrollo
pnpm --filter @restaurant-erp/backend dev    # http://localhost:4000
pnpm --filter @restaurant-erp/frontend dev   # http://localhost:5173
```

**Login de arranque:** `admin@restaurant.local` / `CambiarInmediatamente123!` (cambiar inmediatamente, ver `autenticacion.md`).

**Nota de entorno:** en esta máquina existe otro proyecto Docker no relacionado en `D:\WEB\erp_dbvc` que ocupa el puerto 5432. Por eso PostgreSQL de este proyecto usa el puerto **5433** (ver `.env`/`.env.example`). No tocar esos contenedores.

## Qué existe hasta ahora

- **Monorepo pnpm** (`apps/backend`, `apps/frontend`, `packages/*`) — FASE 1.
- **Base de datos** (FASE 2 en adelante): 20 migraciones aplicadas. Ver `base-de-datos.md` para el detalle y el listado completo.
- **Backend base** (FASE 3): Express, Helmet, CORS, rate limiting, manejo de errores, formato de respuesta consistente. Ver `api.md`.
- **Frontend base** (FASE 4): Vite + React 19 + Tailwind 4 + React Router 8 + TanStack Query. Ver `frontend.md`.
- **Usuarios/Personal/Empresa/Roles/Permisos (FASE 5-6)**: CRUD completo backend (controller/service/repository/dto con zod) para los 5 módulos, con reglas de negocio reales (unicidad de RUC/documento/email, 1 usuario por personal, etc.). Frontend: páginas `Usuarios`, `Personal`, `Roles`, `Empresa` con tabla + formulario de creación (modal), usando TanStack Query.
- **Autenticación (FASE 7)**: JWT access token (memoria, corta duración) + refresh token (cookie httpOnly, rotación en cada uso, revocable en BD). Login, logout, refresh, `/me`, cambiar contraseña — backend y frontend completos. Rutas admin protegidas por `ProtectedRoute`, autorización por permiso (no por rol) en cada endpoint. Ver `autenticacion.md` y `roles-y-permisos.md`.
- **Editar/eliminar + validaciones (2026-09-07)**: Usuarios/Personal/Roles tienen editar y eliminar en el frontend. `personal.eliminar`/`usuarios.eliminar` = desactivar (con cascada personal→usuario); `roles.eliminar` = borrado real (bloqueado si hay usuarios con ese rol). El número de documento de `Personal` valida su formato según el tipo (DNI=8 dígitos, RUC=11) en backend y frontend. Botón de búsqueda RENIEC/SUNAT vía **apis.net.pe** (ahora sobre `api.decolecta.com/v1`, ver corrección en `decisiones-tecnicas.md`) — funciona solo si se configura `APIS_NET_PE_TOKEN` en `.env` (opcional, degrada con 503 si falta). Ver `api.md` y `roles-y-permisos.md`.
- **Rediseño visual base (2026-09-07)**: tipografía "Plus Jakarta Sans", acento naranja sobre neutros `zinc`, iconos `lucide-react`, componentes `Button`/`Badge`/`StatCard`/`EmptyState`/`ConfirmDialog` reutilizables. Ver `frontend.md`.
- **Sidebar deslizable/colapsable con submenús (2026-09-07)**: en escritorio se colapsa a solo iconos (persistido en `localStorage`); en móvil es un drawer off-canvas con overlay, abierto desde un botón de menú en el Navbar. Los enlaces se filtran según los permisos reales del usuario. El menú ahora es un acordeón agrupado por dominio — "Carta" (Categorías/Marcas/Productos), "Local" (Salones/Mesas), "Clientes", "Administración" (Usuarios/Personal/Roles), "Empresa" (Configuración) — preparado para que Ventas/Pedidos/Caja/Inventario agreguen su propio grupo más adelante sin rehacer el componente. Ver `frontend.md`.
- **Dashboard reordenado (2026-09-07)**: las StatCard estaban en una sola grilla plana de 9 tarjetas idénticas sin agrupar (feedback del usuario: "se ve feo"). Ahora se agrupan en secciones tituladas que calzan con los grupos del sidebar, y cada tarjeta es un link a su módulo.
- **Categorías (FASE 8)**: CRUD completo backend + frontend (`/categorias`), permisos `categorias.*`. `DELETE` bloqueado (409) si tiene productos.
- **Marcas y Unidad de Medida SUNAT (2026-09-07, ampliación de FASE 9)**: `Marcas` es un catálogo propio del negocio (CRUD completo, `/marcas`, permisos `marcas.*`, opcional en un producto); `unidades_medida` es el Catálogo SUNAT N° 03 (sembrado por migración, solo lectura vía `/api/catalogos/unidades-medida`, igual que tipos de documento/comprobante). Ambos se agregaron a `productos` (`marca_id` nullable, `unidad_medida_id` obligatoria).
- **Productos (FASE 9)**: CRUD completo backend + frontend (`/productos`) con foto (subida vía `multer`, servida en `/uploads`), marca opcional, unidad de medida, filtro por categoría, tarjetas con zoom al hover. La **carta pública** (`/carta`, sin login) ahora consume `GET /api/productos/publico` y muestra productos reales agrupados por categoría con el mismo tratamiento visual. Ver `api.md` y `decisiones-tecnicas.md`.
- **Salones y Mesas (FASE 10, 2026-09-07)**: CRUD completo backend + frontend. `Salon` es un catálogo simple (nombre/descripción/activo, igual patrón que Categoría); `Mesa` pertenece a un salón (`salon_id` FK, `ON DELETE RESTRICT`), con `numero` + `capacidad`, único por `(salon_id, numero)` (no puede haber dos "Mesa 1" en el mismo salón, sí en salones distintos). `DELETE` de Salón bloqueado (409) si tiene mesas. Sin estado de ocupación todavía (libre/ocupada) — eso se agregará cuando exista Pedidos (FASE 12) y tenga sentido asignar mesas a órdenes reales.
- **Clientes (FASE 11, 2026-09-07)**: registro de clientes (`nombres`, `apellidos`, `telefono`, `email`, `direccion`, todos opcionales salvo `nombres`). `email` único cuando se proporciona. `.eliminar` = desactivar (como Personal/Usuarios, es una persona, se conserva el historial), no borrado real. Todavía no ligado a Pedidos/Ventas/Reservas (no existen aún).
- **Cliente acoplado a SUNAT (2026-09-07, corrección tras feedback del usuario "todo está acoplado de acuerdo a SUNAT")**: `Cliente` ahora tiene `tipoDocumentoIdentidad` (FK nullable al mismo Catálogo SUNAT 06 que usa `Personal`) en vez de un `numeroDocumento` de texto libre; ambos campos son opcionales pero van juntos (si se da uno, se exige el otro). Se agregó el mismo botón de búsqueda RENIEC/SUNAT que tiene Personal. Para no duplicar código, `consulta-documento.service.ts` y la validación de formato por tipo de documento se movieron de `modules/personal/` a `modules/catalogos/` (compartidos), y el componente de búsqueda del frontend se extrajo a `components/CampoBusquedaDocumento.tsx` (genérico sobre el formulario), usado ahora por Personal y Clientes.
- **Fix de layout: sidebar más corto que la página (2026-09-07)**: `AdminLayout` usaba `min-h-screen` en el contenedor exterior pero el `<aside>` tenía `h-screen` (100vh fijo) — cuando el contenido de una página excedía la altura de pantalla, el sidebar se quedaba corto y se veía el fondo claro debajo. Se cambió el shell completo a `h-screen overflow-hidden`, de forma que solo el `<main>` hace scroll interno y el sidebar siempre cubre el 100% de la pantalla, sin importar cuánto contenido tenga la página.
- **Reservas de mesa (FASE 11.5, 2026-09-07)**: CRUD backend + frontend (`/reservas`). Reglas de negocio reales: cliente y mesa deben existir y estar activos, `cantidadPersonas` no puede exceder la capacidad de la mesa, la fecha debe ser futura, y no se permite solapamiento de horario para la misma mesa (calculado en SQL sobre `fecha_hora` + `duracion_minutos`, no en memoria). Ciclo de vida vía `estado` (enum de Postgres: `pendiente`→`confirmada`→`completada`, o `cancelada`); `DELETE` = poner `estado = cancelada`, no borra la fila. Frontend con filtro por estado y acciones rápidas (Confirmar/Completar/Cancelar) según el estado actual. **Bug real encontrado y corregido durante las pruebas**: un campo numérico opcional vacío con `valueAsNumber` de react-hook-form viajaba como `null` (via `NaN`) y el backend lo rechazaba con 400 — ver `frontend.md`.
- **Sin implementar todavía:** pedidos, comandas/cocina, ventas, caja, insumos/inventario/kardex, proveedores/compras, recetas (mezcla de insumos por platillo), reportes, auditoría, configuración, y el portal de clientes (login/pago).

## Próximos pasos (en orden)

1. **FASE 12 — Pedidos** (ver `plan-fases.md`).
2. A partir de ahí, seguir el orden de `plan-fases.md`.
3. **Deuda de diseño pendiente** (no bloqueante): aplicar el mismo estándar visual de Productos/Carta (tarjetas, fotos, efectos) a Usuarios/Personal/Roles/Empresa cuando se retomen esos módulos — ver `decisiones-tecnicas.md`.

## Decisiones que ya no requieren volver a discutirse

- Stack tecnológico fijo (React/Vite/Tailwind + Express/TypeORM/PostgreSQL) — no cambiar sin autorización.
- Política: siempre la versión estable más reciente; si hay incompatibilidad real, alternativa documentada en `decisiones-tecnicas.md`, nunca downgrade silencioso.
- Carta pública para clientes: una sola app de frontend, rutas públicas sin login, endpoints backend públicos de solo lectura.
- Portal de clientes (reservas/login/pago): reservas ya en el plan (fase 11.5); login de clientes y pago en línea aprobados en concepto pero como dominio de identidad **separado** del RBAC de staff — se diseñan en detalle en su fase.
- Núcleo de identidad: Empresa → Personal (con tipo de documento SUNAT) → Usuario. `usuarios` ya no tiene `nombre` propio, usa `personal`.
- Catálogo de permisos: controlado por código/migraciones, no editable vía API (solo se consulta y se asigna a roles). Ver `roles-y-permisos.md`.
- Refresh token en cookie httpOnly (no `localStorage`); access token solo en memoria del frontend.

## Si algo no cuadra al retomar

Antes de asumir que la documentación está desactualizada: correr `git log --oneline` y `pnpm --filter @restaurant-erp/backend migration:show` para confirmar el estado real, y contrastarlo contra este documento. Si difieren, confiar en el estado real del código/BD y corregir este documento.
