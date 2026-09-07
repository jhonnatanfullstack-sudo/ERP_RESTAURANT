# Restaurant ERP

Sistema web de gestión integral para restaurante. Las reglas de arquitectura, stack tecnológico y forma de trabajo de este proyecto están definidas en [CLAUDE.md](./CLAUDE.md) y deben respetarse en todo momento.

## Stack

- **Frontend:** React + TypeScript + Vite + TailwindCSS + Axios + React Router + TanStack Query
- **Backend:** Node.js + TypeScript + Express + TypeORM + PostgreSQL
- **Infraestructura local:** Docker (PostgreSQL)

## Estructura del monorepo

```
apps/
  backend/     API REST (Express + TypeORM)
  frontend/    SPA administrativa (React + Vite)
packages/
  types/       Tipos compartidos entre frontend y backend
  validation/  Esquemas de validación compartidos
  config/      Configuración compartida
docs/          Documentación técnica del proyecto
```

## Requisitos

- Node.js >= 20
- pnpm 11.x
- Docker + Docker Compose

## Puesta en marcha (estado actual: FASE 1)

```bash
pnpm install
cp .env.example .env
docker compose up -d
```

> La conexión de TypeORM, las migraciones y el arranque real del backend/frontend se incorporan en las siguientes fases (ver `docs/`).

## Scripts raíz

| Script              | Descripción                                   |
| ------------------- | --------------------------------------------- |
| `pnpm lint`         | Ejecuta ESLint sobre todo el monorepo         |
| `pnpm format`       | Formatea el código con Prettier               |
| `pnpm format:check` | Verifica formato sin modificar archivos       |
| `pnpm build`        | Ejecuta `build` en cada paquete que lo defina |

## Estado del proyecto

Desarrollo incremental por fases, sin avanzar a la siguiente sin autorización explícita. Ver progreso y decisiones técnicas en `docs/`.
