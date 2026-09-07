# Frontend

## Stack (FASE 4)

React 19 + TypeScript + Vite 8 + TailwindCSS 4 (plugin `@tailwindcss/vite`, configuración CSS-first, sin `tailwind.config.js`) + React Router 8 + TanStack Query 5 + Axios + react-hook-form + lucide-react (iconos).

## Sistema visual (2026-09-07)

- **Tipografía:** "Plus Jakarta Sans" (Google Fonts, cargada en `index.html`), configurada como `--font-sans` en `index.css`.
- **Color de marca:** `orange-600` (acentos, botones primarios, estado activo del sidebar). Neutros en `zinc-*` (más cálido que `slate`, combina con el naranja). Sidebar en `zinc-900` (oscuro) con el resto de la app en `zinc-50`/blanco.
- **Componentes UI reutilizables** (`components/ui/`): `Button` (variantes primary/secondary/ghost/danger), `Badge` (estados: exito/neutral/peligro), `StatCard` (tarjetas de métricas del dashboard), `EmptyState` (estados vacíos con icono), además de `Table`, `Modal`, `Alert`, `Spinner` ya existentes, todos rediseñados con el mismo lenguaje visual (bordes `zinc-200`, `rounded-lg`/`rounded-xl`, `shadow-sm`).
- Antes de crear un nuevo elemento visual (botón, badge, tarjeta), revisar `components/ui/` — ya existe casi todo lo necesario para mantener consistencia (regla 8 de `CLAUDE.md`).

## Estructura

```
src/
  components/     Sidebar, Navbar (shell del layout admin)
  components/ui/  Table, Modal, Alert, Spinner — primitivas reutilizables por todas las páginas
  layouts/         AdminLayout (Sidebar+Navbar+Outlet), PublicLayout (header simple+Outlet)
  pages/           Dashboard, Login, CambiarPassword, Usuarios, Personal, Roles, Empresa
  pages/public/    Carta (placeholder, datos reales en FASE 8-9)
  routes/          AppRoutes.tsx (árbol de rutas), ProtectedRoute.tsx (guard de auth)
  context/         AuthContext.tsx — sesión, login/logout, tienePermiso(codigo)
  services/        api.ts (instancia Axios + interceptores) y un *.service.ts por módulo
  types/api.ts     Tipos compartidos de las respuestas de la API
  hooks/           (vacío, se usa a partir de los módulos de negocio)
```

## Rutas actuales

| Ruta                | Layout  | Página                                                 | Protegida             |
| ------------------- | ------- | ------------------------------------------------------ | --------------------- |
| `/`                 | Admin   | Dashboard                                              | Sí (`ProtectedRoute`) |
| `/usuarios`         | Admin   | Usuarios (lista + crear)                               | Sí                    |
| `/personal`         | Admin   | Personal (lista + crear)                               | Sí                    |
| `/roles`            | Admin   | Roles (lista + crear, con selección de permisos)       | Sí                    |
| `/empresa`          | Admin   | Empresa (lista + editar)                               | Sí                    |
| `/cambiar-password` | Admin   | Cambiar contraseña propia                              | Sí                    |
| `/login`            | —       | Login (formulario real, conectado a `/api/auth/login`) | No                    |
| `/carta`            | Público | Carta (placeholder, datos reales en FASE 8-9)          | No                    |

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
