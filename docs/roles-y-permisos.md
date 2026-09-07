# Roles y permisos

## Modelo (RBAC, sección 10 de `CLAUDE.md`)

`usuarios` → `rol` (N:1) → `permisos` (N:M vía `roles_permisos`). La autorización se verifica siempre por **código de permiso** (ej. `usuarios.crear`), nunca por el nombre del rol — así lo exige la sección 10.

## Catálogo de permisos actual

El catálogo de permisos es controlado por el código (sembrado en migraciones), no editable vía API — solo se puede **consultar** (`GET /api/permisos`) y **asignar a un rol** (`PUT /api/roles/:id/permisos`). Esto evita que se creen códigos de permiso que ningún middleware verifica realmente.

| Código                                                | Descripción                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `usuarios.ver` / `.crear` / `.editar` / `.eliminar`   | Gestión de cuentas de usuario (`.eliminar` = desactivar)                             |
| `personal.ver` / `.crear` / `.editar` / `.eliminar`   | Gestión de personal (`.eliminar` = desactivar, cascada a su usuario)                 |
| `roles.ver` / `.crear` / `.editar` / `.eliminar`      | Gestión de roles (`.eliminar` = borrado real, bloqueado si hay usuarios con ese rol) |
| `permisos.ver`                                        | Consulta del catálogo de permisos                                                    |
| `empresa.ver` / `.crear` / `.editar`                  | Gestión de la empresa (sin `.eliminar`: una empresa no se borra)                     |
| `categorias.ver` / `.crear` / `.editar` / `.eliminar` | Gestión de categorías de la carta (`.eliminar` bloqueado si tiene productos)         |
| `marcas.ver` / `.crear` / `.editar` / `.eliminar`     | Gestión de marcas de producto (`.eliminar` bloqueado si tiene productos)             |
| `productos.ver` / `.crear` / `.editar` / `.eliminar`  | Gestión de productos (`.eliminar` = borrado real, también borra la foto)             |

Se amplía este catálogo (con una nueva migración) a medida que se implementen los módulos correspondientes — ej. `mesas.*` / `salones.*` en FASE 10, `caja.*` en FASE 15, siguiendo los ejemplos ya listados en la sección 10 de `CLAUDE.md`.

## Semántica de "eliminar" (2026-09-07)

- **Usuarios y Personal** tienen columna `activo`: "eliminar" es un **borrado lógico** (`DELETE` en la API pone `activo = false`), no se pierde el registro ni se rompe integridad referencial. Al desactivar un `personal`, su `usuario` (si tiene uno) también se desactiva automáticamente. Un usuario no puede desactivarse a sí mismo (protección contra bloqueo accidental).
- **Roles** no tiene columna `activo`: "eliminar" es un **borrado real** (`DELETE FROM roles`), bloqueado con 409 si algún usuario todavía tiene ese rol asignado.
- **Categorías y Marcas**: mismo patrón que Roles — borrado real, bloqueado con 409 si algún producto todavía las referencia (`producto.categoria_id` / `producto.marca_id` son `ON DELETE RESTRICT`; el pre-check en el service evita que la violación de FK llegue como un 500 sin explicación).
- **Empresa** no tiene endpoint de eliminar — una empresa no se borra desde la UI.

## Rol de arranque

`Administrador` — tiene todos los permisos del catálogo actual. Creado por la migración semilla, junto con el usuario `admin@restaurant.local` (ver `autenticacion.md`).

## Endpoints

| Método | Ruta                      | Permiso requerido   |
| ------ | ------------------------- | ------------------- |
| GET    | `/api/roles`              | `roles.ver`         |
| GET    | `/api/roles/:id`          | `roles.ver`         |
| POST   | `/api/roles`              | `roles.crear`       |
| PUT    | `/api/roles/:id`          | `roles.editar`      |
| PUT    | `/api/roles/:id/permisos` | `roles.editar`      |
| DELETE | `/api/roles/:id`          | `roles.eliminar`    |
| GET    | `/api/permisos`           | `permisos.ver`      |
| DELETE | `/api/usuarios/:id`       | `usuarios.eliminar` |
| DELETE | `/api/personal/:id`       | `personal.eliminar` |

## Frontend

Páginas `Usuarios`, `Personal` y `Roles`: lista + crear + **editar** + **eliminar/desactivar**, cada acción condicionada al permiso correspondiente (`tienePermiso('xxx.editar')`, etc.). Las acciones destructivas usan `ConfirmDialog` (confirmación explícita antes de ejecutar). `Personal` valida en el formulario que el número de documento coincida con el formato del tipo elegido (8 dígitos para DNI, 11 para RUC) usando la misma regla que el backend (`utils/documento.ts`).
