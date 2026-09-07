# Base de datos y migraciones

## Motor y conexión

PostgreSQL 18 (Docker, ver `docker-compose.yml`). Conexión gestionada por TypeORM (`apps/backend/src/database/data-source.ts`), con `synchronize: false` en todo momento — el esquema se gestiona exclusivamente mediante migraciones.

## Esquema actual (FASE 2 — RBAC de personal interno)

| Tabla            | Descripción                                             | PK                       |
| ---------------- | ------------------------------------------------------- | ------------------------ |
| `usuarios`       | Personal interno del restaurante (staff)                | `id` uuid                |
| `roles`          | Roles asignables a usuarios (ej. Administrador, Cajero) | `id` uuid                |
| `permisos`       | Permisos específicos (ej. `usuarios.crear`)             | `id` uuid                |
| `roles_permisos` | Relación N:M entre `roles` y `permisos`                 | (`rol_id`, `permiso_id`) |
| `refresh_tokens` | Tokens de refresco de sesión, por usuario               | `id` uuid                |

**Relaciones:**

- `usuarios.rol_id` → `roles.id` (`ON DELETE RESTRICT`: no se puede borrar un rol con usuarios asignados)
- `refresh_tokens.usuario_id` → `usuarios.id` (`ON DELETE CASCADE`)
- `roles_permisos` conecta `roles` ↔ `permisos` (`ON DELETE CASCADE` en ambos lados)

**Notas de seguridad:**

- `usuarios.password_hash` tiene `select: false` a nivel de entidad: no se incluye en consultas por defecto, hay que pedirlo explícitamente. Nunca se expone en respuestas de la API.
- `refresh_tokens.token_hash` almacena el hash del token, no el token en texto plano.

**Índices:** únicos en `usuarios.email`, `roles.nombre`, `permisos.codigo`, `refresh_tokens.token_hash`; de rendimiento en `roles_permisos(rol_id)` y `roles_permisos(permiso_id)`.

Este esquema es exclusivamente para el RBAC del personal interno. El login de clientes (portal público) será un dominio de identidad separado — ver `decisiones-tecnicas.md`.

## Migraciones

Ubicación: `apps/backend/src/database/migrations/`.

| Comando (`pnpm --filter @restaurant-erp/backend <script>`) | Uso                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------ |
| `migration:generate <ruta>`                                | Genera una migración comparando entidades vs. esquema actual |
| `migration:run`                                            | Aplica las migraciones pendientes                            |
| `migration:revert`                                         | Revierte la última migración aplicada                        |
| `migration:show`                                           | Lista migraciones aplicadas/pendientes                       |

Migraciones aplicadas:

1. `EsquemaInicialRbac` — crea `usuarios`, `roles`, `permisos`, `roles_permisos`, `refresh_tokens`.
