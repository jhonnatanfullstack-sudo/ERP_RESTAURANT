# Frontend

## Stack (FASE 4)

React 19 + TypeScript + Vite 8 + TailwindCSS 4 (plugin `@tailwindcss/vite`, configuración CSS-first, sin `tailwind.config.js`) + React Router 8 + TanStack Query 5 + Axios + react-hook-form + lucide-react (iconos).

## Sistema visual (2026-09-07)

- **Tipografía:** "Plus Jakarta Sans" (Google Fonts, cargada en `index.html`), configurada como `--font-sans` en `index.css`.
- **Color de marca:** `orange-600` (acentos, botones primarios, estado activo del sidebar). Neutros en `zinc-*` (más cálido que `slate`, combina con el naranja). Sidebar en `zinc-900` (oscuro) con el resto de la app en `zinc-50`/blanco.
- **Componentes UI reutilizables** (`components/ui/`): `Button` (variantes primary/secondary/ghost/danger), `Badge` (estados: exito/neutral/peligro), `StatCard` (tarjetas de métricas del dashboard), `EmptyState` (estados vacíos con icono), además de `Table`, `Modal`, `Alert`, `Spinner` ya existentes, todos rediseñados con el mismo lenguaje visual (bordes `zinc-200`, `rounded-lg`/`rounded-xl`, `shadow-sm`).
- Antes de crear un nuevo elemento visual (botón, badge, tarjeta), revisar `components/ui/` — ya existe casi todo lo necesario para mantener consistencia (regla 8 de `CLAUDE.md`).
- **Sidebar deslizable/colapsable (2026-09-07)**: en escritorio, un botón la colapsa a una barra solo-iconos (con `title` como tooltip), preferencia persistida en `localStorage`; en móvil (`<md`) se convierte en un drawer off-canvas (`position: fixed` + `translate-x`) con backdrop, abierto desde un botón de menú (`Menu` de lucide) en el `Navbar`. Los enlaces se filtran por `tienePermiso(...)` — un usuario sin el permiso `xxx.ver` de un módulo no ve su enlace (ni el grupo completo si ninguno de sus hijos es visible).
- **Fix de layout — shell fijo al viewport (2026-09-07)**: `AdminLayout` tenía el contenedor exterior en `min-h-screen` (crece con el contenido) pero el `<aside>` en `h-screen` (100vh fijo); si una página tenía más contenido que la pantalla, el sidebar quedaba corto y se veía el fondo claro debajo (reporte del usuario: "el sidebar es más pequeño que el tamaño de la página"). Ahora el contenedor exterior es `h-screen overflow-hidden` y la columna derecha `overflow-hidden` también, de forma que **solo `<main>` hace scroll** (`flex-1 overflow-y-auto`) y el sidebar siempre cubre el 100% del viewport sin importar cuánto contenido tenga la página. Patrón a mantener: nunca poner `h-screen` en un hijo cuyo padre no esté también fijado a `h-screen` — o el hijo se desincroniza cuando el contenido crece.
- **Sidebar con submenús (2026-09-07)**: `components/Sidebar.tsx` define `menu: ItemMenu[]` como una lista de enlaces simples o grupos (`{ tipo: 'grupo', etiqueta, icono, hijos: [...] }`); los grupos actuales son "Carta" (Categorías/Marcas/Productos), "Local" (Salones/Mesas), "Clientes" (Clientes/Reservas), "Administración" (Usuarios/Personal/Roles) y "Empresa" (Configuración) — pensados para que las fases futuras (Ventas, Pedidos, Caja, Inventario...) agreguen su propio grupo en vez de reestructurar el componente. Cada grupo es un acordeón (estado `Set<string>` de grupos abiertos, sin `useEffect` — el grupo de la ruta activa se abre vía el inicializador perezoso de `useState`, no reactivamente, para evitar el lint `react-hooks/set-state-in-effect`); en el modo colapsado (solo iconos), tocar un grupo fuerza expandir la barra completa (`onExpandir`) y lo abre.
- **Dashboard agrupado por sección (2026-09-07)**: `Dashboard.tsx` arma un arreglo `secciones` (título + lista de tarjetas con su `useQuery` correspondiente) y renderiza cada una con un encabezado `uppercase` seguido de una grilla — mismo agrupamiento que el sidebar. Reemplazó una grilla única de 9 `StatCard` sin agrupar que quedaba con saltos de columna incómodos. `StatCard` ahora acepta una prop `ruta` opcional: si se pasa, la tarjeta completa es un `Link` a esa página.
- **Patrón de tarjetas con foto (desde FASE 9, ver Productos/Carta)**: para catálogos con imagen (no tablas de datos administrativos como Usuarios/Roles), se usa una grilla de tarjetas (`grid grid-cols-*`) con imagen en `aspect-4/3`, `overflow-hidden` + `group-hover:scale-110` `transition-transform` para el efecto de zoom, badge de categoría superpuesto, y precio con `Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' })` (helper `utils/formato.ts: formatearPrecio`). Reutilizar este patrón para futuros módulos con imagen en vez de crear uno nuevo.
- **Búsqueda de documento SUNAT compartida (2026-09-07)**: `components/CampoBusquedaDocumento.tsx` es un componente genérico (sobre el tipo de formulario, vía generics de react-hook-form: `Control<T>`, `Path<T>`, etc.) que renderiza el campo "N° de documento" + botón de búsqueda RENIEC/SUNAT. Antes vivía duplicado dentro de `Personal.tsx`; ahora lo usan tanto `Personal.tsx` como `Clientes.tsx`, cada uno pasando su propia función `consultar` (`personalService.consultarDocumento` / `clientesService.consultarDocumento`) y su propio `onEncontrado` para mapear el resultado a sus campos (Personal separa apellido paterno/materno; Clientes los concatena en un solo campo `apellidos`). Antes de crear un campo de documento nuevo, usar este componente, no duplicarlo.
- **Reservas (FASE 11.5, 2026-09-07)**: `Reservas.tsx` usa un `<input type="datetime-local">` para `fechaHora`; helpers nuevos en `utils/formato.ts` — `aInputDatetimeLocal(iso)` convierte un ISO de la API a la forma local que ese input espera (al editar), y `formatearFechaHora(iso)` la formatea para mostrar en la tabla (`Intl.DateTimeFormat('es-PE', ...)`). **Gotcha real encontrado y corregido:** con `valueAsNumber: true` en un campo numérico opcional (`duracionMinutos`) dejado vacío, react-hook-form produce `NaN` (no `undefined`), que `JSON.stringify` convierte en `null` — y el schema zod del backend (`.optional()`, sin `.nullable()`) lo rechaza con 400 "Datos de entrada inválidos". Antes de enviar, hay que convertir `NaN` a `undefined` explícitamente (`Number.isNaN(valor) ? undefined : valor`) para que la clave se omita del body en vez de viajar como `null`. Aplica a cualquier campo numérico opcional con `valueAsNumber`, no solo a este.
- **Deuda de diseño pendiente:** Usuarios/Personal/Roles/Empresa siguen con el diseño de tabla simple original; se elevarán al mismo estándar visual en una fase/commit separado cuando se retomen (decisión del usuario, ver `decisiones-tecnicas.md`), no se rediseñó todo el proyecto de una sola vez.
- **Combobox de búsqueda (2026-09-08):** `components/ui/Combobox.tsx` — select con autocompletado (botón que abre un dropdown con un input de texto + lista filtrable), pensado para reemplazar un `<select>` nativo cuando la lista de opciones puede crecer y buscar por nombre es más rápido que desplazarse. Se integra con react-hook-form vía `Controller` (no vía `register`, porque no es un `<input>` nativo). Aplicado en: Reservas (cliente, mesa), Usuarios (personal), Pedidos (mesa, producto) — se dejaron como `<select>` nativo los combos de catálogos pequeños y acotados (categoría/marca/unidad de medida en Productos, salón en Mesas, rol en Usuarios), que no se benefician de la búsqueda.
- **Dashboard con resumen del día (2026-09-08):** `Dashboard.tsx` ahora tiene, antes del índice agrupado de accesos rápidos, una fila de tarjetas de "resumen de hoy" (pedidos abiertos, reservas de hoy, reservas pendientes, mesas activas, clientes activos) con datos reales vía TanStack Query, encabezado con la fecha larga en español (`utils/formato.ts: formatearFechaLarga`), y `StatCard` ahora acepta un `tono` (`naranja`/`azul`/`esmeralda`/`ambar`/`violeta`) para variar el color del icono entre tarjetas en vez de usar naranja en todas.
- **Pedidos (FASE 12, 2026-09-08):** a diferencia del resto de módulos (formulario en `Modal`), Pedidos usa una página de detalle dedicada (`/pedidos/:id`, `PedidoDetalle.tsx`) porque gestionar líneas de producto (agregar/editar cantidad/quitar, una a la vez, con recálculo de total) no encaja bien en un formulario de una sola sección dentro de un modal pequeño. `Pedidos.tsx` (lista) solo abre un `Modal` simple para elegir la mesa inicial; el resto de la gestión ocurre en la página de detalle. Precedente a seguir si un futuro módulo (ej. Compras con líneas de insumos) tiene la misma forma "cabecera + líneas editables".

## Estructura

```
src/
  components/     Sidebar, Navbar (shell del layout admin)
  components/ui/  Table, Modal, Alert, Spinner — primitivas reutilizables por todas las páginas
  layouts/         AdminLayout (Sidebar+Navbar+Outlet), PublicLayout (header simple+Outlet)
  pages/           Dashboard, Login, CambiarPassword, Usuarios, Personal, Roles, Empresa, Categorias, Marcas, Productos, Salones, Mesas, Clientes, Reservas, Pedidos, PedidoDetalle
  pages/public/    Carta (datos reales desde FASE 9: GET /api/productos/publico)
  routes/          AppRoutes.tsx (árbol de rutas), ProtectedRoute.tsx (guard de auth)
  context/         AuthContext.tsx — sesión, login/logout, tienePermiso(codigo)
  services/        api.ts (instancia Axios + interceptores) y un *.service.ts por módulo
  types/api.ts     Tipos compartidos de las respuestas de la API
  hooks/           (vacío, se usa a partir de los módulos de negocio)
```

## Rutas actuales

| Ruta                | Layout  | Página                                                             | Protegida             |
| ------------------- | ------- | ------------------------------------------------------------------ | --------------------- |
| `/`                 | Admin   | Dashboard                                                          | Sí (`ProtectedRoute`) |
| `/usuarios`         | Admin   | Usuarios (lista + crear)                                           | Sí                    |
| `/personal`         | Admin   | Personal (lista + crear)                                           | Sí                    |
| `/roles`            | Admin   | Roles (lista + crear, con selección de permisos)                   | Sí                    |
| `/empresa`          | Admin   | Empresa (lista + editar)                                           | Sí                    |
| `/categorias`       | Admin   | Categorías (lista + crear + editar + eliminar)                     | Sí                    |
| `/marcas`           | Admin   | Marcas (lista + crear + editar + eliminar)                         | Sí                    |
| `/productos`        | Admin   | Productos (tarjetas con foto, marca, unidad de medida)             | Sí                    |
| `/salones`          | Admin   | Salones (lista + crear + editar + eliminar)                        | Sí                    |
| `/mesas`            | Admin   | Mesas (tabla + filtro por salón)                                   | Sí                    |
| `/clientes`         | Admin   | Clientes (lista + crear + editar + desactivar)                     | Sí                    |
| `/reservas`         | Admin   | Reservas (tabla + filtro por estado, confirmar/completar/cancelar) | Sí                    |
| `/pedidos`          | Admin   | Pedidos (tabla + filtro por estado, crear, cancelar)               | Sí                    |
| `/pedidos/:id`      | Admin   | Detalle de pedido (agregar/editar/quitar líneas, cerrar/cancelar)  | Sí                    |
| `/cambiar-password` | Admin   | Cambiar contraseña propia                                          | Sí                    |
| `/login`            | —       | Login (formulario real, conectado a `/api/auth/login`)             | No                    |
| `/carta`            | Público | Carta (datos reales: productos activos por categoría)              | No                    |

`ProtectedRoute` redirige a `/login` si no hay sesión (tras intentar un refresh silencioso vía cookie httpOnly). Cada página oculta sus acciones de creación/edición si el usuario no tiene el permiso correspondiente (`tienePermiso('xxx.crear')`), aunque la protección real está en el backend.

La separación pública/admin en una sola app sigue la decisión documentada en `decisiones-tecnicas.md` (carta pública para clientes).

## Autenticación en el frontend

Ver `autenticacion.md` para el detalle completo del flujo. En resumen: `AuthContext` restaura la sesión al montar la app (refresh silencioso), el `accessToken` vive solo en memoria (módulo `services/api.ts`), y el interceptor de Axios reintenta una vez con refresh ante un 401.

## Variables de entorno

`apps/frontend/.env` (no versionado, ver `.env.example`): `VITE_API_URL` — URL base del backend para Axios.

## Cómo correr el frontend

```bash
pnpm --filter @restaurant-erp/frontend dev      # http://localhost:5173
pnpm --filter @restaurant-erp/frontend build    # typecheck + build de producción a dist/
pnpm --filter @restaurant-erp/frontend preview  # sirve el build de producción
```

## Verificación realizada

- `tsc` (typecheck) y `vite build` (producción) sin errores.
- **Verificado visualmente en navegador real** (Chromium vía Playwright, instalado temporalmente fuera del proyecto solo para pruebas): flujo completo probado — redirección a `/login` sin sesión, login con el usuario semilla, navegación a Usuarios/Personal/Roles/Empresa con datos reales de la base de datos, persistencia de sesión tras recargar la página, cambio de contraseña, y logout. Sin errores de consola (aparte de los 401 esperados de la verificación de sesión al cargar sin estar logueado).
