# Roles y permisos

## Modelo (RBAC, sección 10 de `CLAUDE.md`)

`usuarios` → `rol` (N:1) → `permisos` (N:M vía `roles_permisos`). La autorización se verifica siempre por **código de permiso** (ej. `usuarios.crear`), nunca por el nombre del rol — así lo exige la sección 10.

## Catálogo de permisos actual

El catálogo de permisos es controlado por el código (sembrado en migraciones), no editable vía API — solo se puede **consultar** (`GET /api/permisos`) y **asignar a un rol** (`PUT /api/roles/:id/permisos`). Esto evita que se creen códigos de permiso que ningún middleware verifica realmente.

| Código                                                | Descripción                                                                                                                                                                |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `usuarios.ver` / `.crear` / `.editar` / `.eliminar`   | Gestión de cuentas de usuario (`.eliminar` = desactivar)                                                                                                                   |
| `personal.ver` / `.crear` / `.editar` / `.eliminar`   | Gestión de personal (`.eliminar` = desactivar, cascada a su usuario)                                                                                                       |
| `roles.ver` / `.crear` / `.editar` / `.eliminar`      | Gestión de roles (`.eliminar` = borrado real, bloqueado si hay usuarios con ese rol)                                                                                       |
| `permisos.ver`                                        | Consulta del catálogo de permisos                                                                                                                                          |
| `empresa.ver` / `.crear` / `.editar`                  | Gestión de la empresa (sin `.eliminar`: una empresa no se borra)                                                                                                           |
| `categorias.ver` / `.crear` / `.editar` / `.eliminar` | Gestión de categorías de la carta (`.eliminar` bloqueado si tiene productos)                                                                                               |
| `marcas.ver` / `.crear` / `.editar` / `.eliminar`     | Gestión de marcas de producto (`.eliminar` bloqueado si tiene productos)                                                                                                   |
| `productos.ver` / `.crear` / `.editar` / `.eliminar`  | Gestión de productos (`.eliminar` = borrado real, también borra la foto)                                                                                                   |
| `salones.ver` / `.crear` / `.editar` / `.eliminar`    | Gestión de salones (`.eliminar` bloqueado si tiene mesas)                                                                                                                  |
| `mesas.ver` / `.crear` / `.editar` / `.eliminar`      | Gestión de mesas (`.eliminar` = borrado real)                                                                                                                              |
| `clientes.ver` / `.crear` / `.editar` / `.eliminar`   | Gestión de clientes (`.eliminar` = desactivar)                                                                                                                             |
| `reservas.ver` / `.crear` / `.editar` / `.eliminar`   | Gestión de reservas de mesa (`.eliminar` = cancelar)                                                                                                                       |
| `pedidos.ver` / `.crear` / `.editar` / `.eliminar`    | Gestión de pedidos de mesa (`.editar` también cubre agregar/editar/quitar líneas de detalle **y enviar líneas a cocina**; `.eliminar` = cancelar)                          |
| `cocina.ver` / `.editar` / `.eliminar`                | Cola de comandas de cocina (`.editar` = avanzar estado; `.eliminar` = cancelar una comanda pendiente; no hay `.crear`, ver nota abajo)                                     |
| `ventas.ver` / `.crear` / `.anular`                   | Comprobantes de venta (`.crear` = registrar una venta desde un pedido cerrado; `.anular` en vez de `.eliminar` — así lo nombra el ejemplo de la sección 10 de `CLAUDE.md`) |

Se amplía este catálogo (con una nueva migración) a medida que se implementen los módulos correspondientes — ej. `caja.*` en FASE 15, siguiendo los ejemplos ya listados en la sección 10 de `CLAUDE.md`.

**Nota sobre `cocina` (FASE 13):** "enviar una línea a cocina" (`POST /api/comandas`) no usa un permiso `cocina.crear` — reutiliza `pedidos.editar`, porque conceptualmente es una acción sobre el pedido (el mesero decide qué se manda a preparar), no una acción de cocina. `cocina.*` gobierna la cola de cocina en sí: verla y avanzar/cancelar comandas.

## Semántica de "eliminar" (2026-09-07)

- **Usuarios, Personal y Clientes** tienen columna `activo`: "eliminar" es un **borrado lógico** (`DELETE` en la API pone `activo = false`), no se pierde el registro ni se rompe integridad referencial. Al desactivar un `personal`, su `usuario` (si tiene uno) también se desactiva automáticamente. Un usuario no puede desactivarse a sí mismo (protección contra bloqueo accidental). `Cliente` no tiene todavía nada que lo referencie (Pedidos/Reservas no existen aún), pero se usa el mismo patrón por ser un registro de persona, no un catálogo.
- **Roles** no tiene columna `activo`: "eliminar" es un **borrado real** (`DELETE FROM roles`), bloqueado con 409 si algún usuario todavía tiene ese rol asignado.
- **Categorías, Marcas y Salones**: mismo patrón que Roles — borrado real, bloqueado con 409 si algún producto/mesa todavía las referencia (FK `ON DELETE RESTRICT`; el pre-check en el service evita que la violación de FK llegue como un 500 sin explicación).
- **Mesas**: borrado real sin restricción (nada las referencia todavía); único `(salon_id, numero)` — crear/editar con un número repetido en el mismo salón responde 409, no una violación de índice sin explicación.
- **Reservas**: no tiene columna `activo` — su ciclo de vida vive en `estado` (`pendiente`/`confirmada`/`cancelada`/`completada`). `DELETE /api/reservas/:id` no borra la fila, pone `estado = 'cancelada'` (mismo espíritu de "no perder el historial" que Usuarios/Personal/Clientes, aplicado a un enum en vez de a un booleano).
- **Pedidos**: mismo patrón que Reservas — ciclo de vida en `estado` (`abierto`/`cerrado`/`cancelado`), `DELETE /api/pedidos/:id` pone `estado = 'cancelado'`. Las líneas de detalle (`detalle_pedidos`) sí son de borrado real (`DELETE .../detalles/:detalleId`), porque son un renglón editable del pedido en curso, no un evento a preservar por sí solo — su historia queda igualmente preservada en el `total` ya recalculado y en cualquier reporte futuro basado en `pedidos` cerrados. **Excepción (FASE 13):** una línea ya asignada a una comanda no admite `PUT`/`DELETE` en absoluto (ni editar ni el borrado real) hasta que esa comanda se cancele.
- **Comandas**: igual patrón — ciclo de vida en `estado`, `DELETE /api/comandas/:id` pone `estado = 'cancelada'` (nunca borrado real), y solo mientras está `pendiente` (una vez que la cocina empieza a prepararla, ya no se cancela).
- **Ventas**: igual patrón — ciclo de vida en `estado`, `DELETE /api/ventas/:id` pone `estado = 'anulada'` (nunca borrado real: un comprobante emitido preserva su número correlativo por normativa, no se borra ni se reutiliza su número). Una venta `anulada` no se puede volver a anular.
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
