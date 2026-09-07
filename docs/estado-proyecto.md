# Estado del proyecto

**Última actualización:** 2026-09-07. Este documento es el punto de entrada para retomar el trabajo en una sesión nueva — léelo primero.

## Resumen ejecutivo

- **Fases completadas:** 0 a 7 (monorepo, base de datos con núcleo Empresa→Personal→Usuario y catálogos SUNAT, backend Express, frontend React, y ahora Usuarios/Roles-Permisos/Autenticación JWT completos de punta a punta — backend + frontend, probados en navegador real).
- **En curso:** FASE 8 (Categorías, incluye endpoint público de carta).
- **Modo de avance:** el usuario autorizó avanzar de fase en fase sin pedir confirmación ("CONTINUAR") en cada una, siempre validando que no haya errores. Ver `plan-fases.md` → sección "Modo de avance".
- **El sistema ya es usable de extremo a extremo**: se puede iniciar sesión, crear personal, crear usuarios y roles, y todo queda protegido por permisos reales.

## Cómo retomar el entorno

```bash
# 1. Instalar dependencias
pnpm install

# 2. Levantar PostgreSQL (Docker Desktop debe estar corriendo)
docker compose up -d
docker inspect restaurant_erp_postgres --format '{{.State.Health.Status}}'  # debe decir "healthy"

# 3. Verificar migraciones aplicadas (deben ser 4)
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
- **Base de datos** (FASE 2): 4 migraciones aplicadas — `EsquemaInicialRbac`, `EmpresaPersonalYCatalogosSunat`, `SeedRbacInicial` (permisos + rol Administrador + empresa/personal/usuario de arranque), `SeedCatalogosSunat`. Ver `base-de-datos.md`.
- **Backend base** (FASE 3): Express, Helmet, CORS, rate limiting, manejo de errores, formato de respuesta consistente. Ver `api.md`.
- **Frontend base** (FASE 4): Vite + React 19 + Tailwind 4 + React Router 8 + TanStack Query. Ver `frontend.md`.
- **Usuarios/Personal/Empresa/Roles/Permisos (FASE 5-6)**: CRUD completo backend (controller/service/repository/dto con zod) para los 5 módulos, con reglas de negocio reales (unicidad de RUC/documento/email, 1 usuario por personal, etc.). Frontend: páginas `Usuarios`, `Personal`, `Roles`, `Empresa` con tabla + formulario de creación (modal), usando TanStack Query.
- **Autenticación (FASE 7)**: JWT access token (memoria, corta duración) + refresh token (cookie httpOnly, rotación en cada uso, revocable en BD). Login, logout, refresh, `/me`, cambiar contraseña — backend y frontend completos. Rutas admin protegidas por `ProtectedRoute`, autorización por permiso (no por rol) en cada endpoint. Ver `autenticacion.md` y `roles-y-permisos.md`.
- **Sin implementar todavía:** todos los módulos de negocio propiamente dichos (productos, mesas, pedidos, ventas, caja, inventario, etc.) y el portal de clientes (carta pública, reservas).

## Próximos pasos (en orden)

1. **FASE 8 — Categorías**: CRUD backend + frontend, más el endpoint público de solo lectura para la carta (`GET /api/public/carta` o similar, sin auth, rate-limited).
2. **FASE 9 — Productos**: igual, con precios visibles en el endpoint público.
3. **FASE 10 — Salones y mesas.**
4. **FASE 11 — Clientes**, seguido de **11.5 — Reservas de mesa** (ver `plan-fases.md`).
5. A partir de ahí, seguir el orden de `plan-fases.md`.

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
