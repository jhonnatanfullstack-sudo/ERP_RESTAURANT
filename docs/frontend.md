# Frontend

## Stack (FASE 4)

React 19 + TypeScript + Vite 8 + TailwindCSS 4 (plugin `@tailwindcss/vite`, configuración CSS-first, sin `tailwind.config.js`) + React Router 8 + TanStack Query 5 + Axios.

## Estructura

```
src/
  components/   Sidebar, Navbar (shell del layout admin)
  layouts/      AdminLayout (Sidebar+Navbar+Outlet), PublicLayout (header simple+Outlet)
  pages/        Dashboard, Login (UI, sin lógica de auth todavía)
  pages/public/ Carta (placeholder, datos reales en FASE 8-9)
  routes/       AppRoutes.tsx — árbol de rutas
  services/     api.ts — instancia de Axios (VITE_API_URL)
  context/      (vacío, se usa desde FASE 7 para el contexto de auth)
  hooks/        (vacío, se usa a partir de los módulos de negocio)
```

## Rutas actuales

| Ruta     | Layout  | Página                         | Protegida                            |
| -------- | ------- | ------------------------------ | ------------------------------------ |
| `/`      | Admin   | Dashboard (placeholder)        | Sí (pendiente de guard real, FASE 7) |
| `/login` | —       | Login (solo UI, deshabilitado) | No                                   |
| `/carta` | Público | Carta (placeholder)            | No                                   |

La separación pública/admin en una sola app sigue la decisión documentada en `decisiones-tecnicas.md` (carta pública para clientes).

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
- Servidor de desarrollo probado con `curl`: HTML raíz, ruta SPA `/carta` (200), CSS de Tailwind compilado y servido, `main.tsx` transpilado sin errores.
- **No verificado visualmente en navegador** en esta sesión (sin herramienta de navegador disponible). Antes de dar por buena la interfaz, abrir `http://localhost:5173` en un navegador real y revisar consola por errores de runtime.
