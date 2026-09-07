# Estado del proyecto

**Última actualización:** 2026-09-07. Este documento es el punto de entrada para retomar el trabajo en una sesión nueva — léelo primero.

## Resumen ejecutivo

- **Fase actual completada:** FASE 4 (sistema base del frontend: Vite + React 19 + Tailwind 4 + React Router 8 + TanStack Query, layout admin + layout público, páginas placeholder).
- **En curso:** FASE 5 (módulo Usuarios).
- **Pendiente de verificación humana:** el frontend no se probó visualmente en un navegador real en esta sesión (sin herramienta de navegador disponible) — solo se validó con `curl`, `tsc` y `vite build`. Abrir `http://localhost:5173` y revisar la consola antes de confiar en que la UI renderiza sin errores de runtime.
- **Modo de avance:** el usuario autorizó avanzar de fase en fase sin pedir confirmación ("CONTINUAR") en cada una, siempre validando que no haya errores. Ver `plan-fases.md` → sección "Modo de avance".

## Cómo retomar el entorno

```bash
# 1. Instalar dependencias
pnpm install

# 2. Levantar PostgreSQL (Docker Desktop debe estar corriendo)
docker compose up -d
docker inspect restaurant_erp_postgres --format '{{.State.Health.Status}}'  # debe decir "healthy"

# 3. Verificar migraciones aplicadas
pnpm --filter @restaurant-erp/backend migration:show

# 4. Validar que todo compila/lint limpio antes de seguir
pnpm lint
pnpm format:check
pnpm --filter @restaurant-erp/backend typecheck
pnpm --filter @restaurant-erp/backend build
```

**Nota de entorno:** en esta máquina existe otro proyecto Docker no relacionado en `D:\WEB\erp_dbvc` que ocupa el puerto 5432. Por eso PostgreSQL de este proyecto usa el puerto **5433** (ver `.env`/`.env.example`). No tocar esos contenedores.

## Qué existe hasta ahora

- **Monorepo pnpm** (`apps/backend`, `apps/frontend`, `packages/*`) — FASE 1.
- **Backend:** TypeORM configurado, `DataSource` sin `synchronize`, 3 migraciones aplicadas:
  1. `EsquemaInicialRbac` — `usuarios`, `roles`, `permisos`, `roles_permisos`, `refresh_tokens`.
  2. `EmpresaPersonalYCatalogosSunat` — `empresas`, `personal`, `tipos_documento_identidad`, `tipos_comprobante`; refactoriza `usuarios` para depender de `personal`.
  3. `SeedCatalogosSunat` — datos semilla de los catálogos SUNAT.
- **Backend base (FASE 3):** `src/app.ts` (Helmet, CORS con `CORS_ORIGIN`, `express.json`, rate limit global 300/15min), `src/server.ts` (bootstrap: conecta TypeORM, luego levanta el servidor), `GET /health` probado en vivo. Manejo de errores centralizado (`src/middlewares/error-handler.middleware.ts` + `src/utils/http-error.ts`) y formato de respuesta consistente (`src/utils/api-response.ts`: `sendSuccess`/`sendError`). Router `/api` montado pero vacío — se llena a partir de FASE 5.
- **Frontend base (FASE 4):** `apps/frontend` con Vite+React+Tailwind+React Router+TanStack Query funcionando (`pnpm --filter @restaurant-erp/frontend dev`/`build` verificados). `AdminLayout` (Sidebar+Navbar) y `PublicLayout`, páginas `Dashboard`, `Login` (solo UI, botón deshabilitado — auth real en FASE 7) y `Carta` (placeholder — datos reales en FASE 8-9). Ver `frontend.md`.
- **Sin implementar todavía:** autenticación JWT, y todos los módulos de negocio (productos, pedidos, ventas, etc.). El router `/` (Dashboard) no tiene guard de autenticación real todavía.
- Detalle completo del esquema: `base-de-datos.md`. Convenciones de API: `api.md`. Frontend: `frontend.md`. Decisiones y su razonamiento: `decisiones-tecnicas.md`. Plan de fases: `plan-fases.md`.

## Próximos pasos (en orden)

1. **FASE 5 — Usuarios:** CRUD de `personal` y `usuarios` (staff) en backend (controller/service/repository) + UI en frontend.
2. **FASE 6 — Roles y permisos:** CRUD de `roles`/`permisos`, asignación rol↔permisos.
3. **FASE 7 — Autenticación y autorización:** login JWT + refresh token (staff), middleware de autorización por permisos, conectar `Login.tsx` y proteger `AdminLayout` de verdad.
4. A partir de ahí, seguir el orden de `plan-fases.md`.

## Decisiones que ya no requieren volver a discutirse

- Stack tecnológico fijo (React/Vite/Tailwind + Express/TypeORM/PostgreSQL) — no cambiar sin autorización.
- Política: siempre la versión estable más reciente; si hay incompatibilidad real, alternativa documentada en `decisiones-tecnicas.md`, nunca downgrade silencioso.
- Carta pública para clientes: una sola app de frontend, rutas públicas sin login, endpoints backend públicos de solo lectura.
- Portal de clientes (reservas/login/pago): reservas ya en el plan (fase 11.5); login de clientes y pago en línea aprobados en concepto pero como dominio de identidad **separado** del RBAC de staff — se diseñan en detalle en su fase.
- Núcleo de identidad: Empresa → Personal (con tipo de documento SUNAT) → Usuario. `usuarios` ya no tiene `nombre` propio, usa `personal`.

## Si algo no cuadra al retomar

Antes de asumir que la documentación está desactualizada: correr `git log --oneline` y `pnpm --filter @restaurant-erp/backend migration:show` para confirmar el estado real, y contrastarlo contra este documento. Si difieren, confiar en el estado real del código/BD y corregir este documento.
