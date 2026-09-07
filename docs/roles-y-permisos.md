# Roles y permisos

## Modelo (RBAC, sección 10 de `CLAUDE.md`)

`usuarios` → `rol` (N:1) → `permisos` (N:M vía `roles_permisos`). La autorización se verifica siempre por **código de permiso** (ej. `usuarios.crear`), nunca por el nombre del rol — así lo exige la sección 10.

## Catálogo de permisos actual

El catálogo de permisos es controlado por el código (sembrado en la migración `SeedRbacInicial`), no editable vía API — solo se puede **consultar** (`GET /api/permisos`) y **asignar a un rol** (`PUT /api/roles/:id/permisos`). Esto evita que se creen códigos de permiso que ningún middleware verifica realmente.

| Código                                | Descripción                            |
| ------------------------------------- | -------------------------------------- |
| `usuarios.ver` / `.crear` / `.editar` | Gestión de cuentas de usuario          |
| `personal.ver` / `.crear` / `.editar` | Gestión de personal (personas físicas) |
| `roles.ver` / `.crear` / `.editar`    | Gestión de roles                       |
| `permisos.ver`                        | Consulta del catálogo de permisos      |
| `empresa.ver` / `.crear` / `.editar`  | Gestión de la empresa                  |

Se amplía este catálogo (con una nueva migración) a medida que se implementen los módulos correspondientes — ej. `productos.*` en FASE 9, `caja.*` en FASE 15, siguiendo los ejemplos ya listados en la sección 10 de `CLAUDE.md`.

## Rol de arranque

`Administrador` — tiene todos los permisos del catálogo actual. Creado por la misma migración semilla, junto con el usuario `admin@restaurant.local` (ver `autenticacion.md`).

## Endpoints

| Método | Ruta                      | Permiso requerido |
| ------ | ------------------------- | ----------------- |
| GET    | `/api/roles`              | `roles.ver`       |
| GET    | `/api/roles/:id`          | `roles.ver`       |
| POST   | `/api/roles`              | `roles.crear`     |
| PUT    | `/api/roles/:id`          | `roles.editar`    |
| PUT    | `/api/roles/:id/permisos` | `roles.editar`    |
| GET    | `/api/permisos`           | `permisos.ver`    |

## Frontend

Página `Roles` (`/roles`): lista de roles con conteo de permisos, y formulario de creación con selección de permisos vía checkboxes. La edición de permisos de un rol existente (`PUT /:id/permisos`) tiene endpoint listo en el backend; la UI para editar un rol ya creado se añadirá cuando se necesite en la práctica (evitar sobre-construir UI no solicitada, sección 11 regla 3 de `CLAUDE.md`).
