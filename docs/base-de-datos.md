# Base de datos y migraciones

## Motor y conexión

PostgreSQL 18 (Docker, ver `docker-compose.yml`). Conexión gestionada por TypeORM (`apps/backend/src/database/data-source.ts`), con `synchronize: false` en todo momento — el esquema se gestiona exclusivamente mediante migraciones.

## Esquema actual (FASE 2 — identidad base y RBAC de personal interno)

**Orden de dependencia (de raíz a hoja):** `empresas` → `personal` → `usuarios` → `refresh_tokens`, con los catálogos SUNAT (`tipos_documento_identidad`, `tipos_comprobante`) y el RBAC (`roles`, `permisos`, `roles_permisos`) como soporte.

| Tabla                       | Descripción                                                                                      | PK                       |
| --------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------ |
| `empresas`                  | Entidad legal/tributaria raíz del sistema (RUC, razón social)                                    | `id` uuid                |
| `tipos_documento_identidad` | Catálogo SUNAT N° 06 (DNI, RUC, CE, Pasaporte, etc.)                                             | `id` uuid                |
| `tipos_comprobante`         | Catálogo SUNAT N° 01 (Factura, Boleta, N. Crédito, etc.)                                         | `id` uuid                |
| `personal`                  | Personas físicas vinculadas a una empresa (staff), identificadas por un tipo+número de documento | `id` uuid                |
| `usuarios`                  | Cuenta de acceso al sistema, 1:1 con un registro de `personal`                                   | `id` uuid                |
| `roles`                     | Roles asignables a usuarios (ej. Administrador, Cajero)                                          | `id` uuid                |
| `permisos`                  | Permisos específicos (ej. `usuarios.crear`)                                                      | `id` uuid                |
| `roles_permisos`            | Relación N:M entre `roles` y `permisos`                                                          | (`rol_id`, `permiso_id`) |
| `refresh_tokens`            | Tokens de refresco de sesión, por usuario                                                        | `id` uuid                |
| `categorias`                | Categorías de la carta (FASE 8)                                                                  | `id` uuid                |
| `marcas`                    | Marcas de producto (ej. una gaseosa embotellada); opcional en `productos`                        | `id` uuid                |
| `unidades_medida`           | Catálogo SUNAT N° 03 (Unidad, Kilogramo, Gramo, Litro, etc.)                                     | `id` uuid                |
| `productos`                 | Productos/platillos de la carta, con foto, marca opcional y unidad de medida (FASE 9)            | `id` uuid                |
| `salones`                   | Ambientes del local donde se ubican las mesas (FASE 10)                                          | `id` uuid                |
| `mesas`                     | Mesas físicas, pertenecen a un salón (FASE 10)                                                   | `id` uuid                |
| `clientes`                  | Clientes del restaurante, sin relación a `personal`/`empresas` (FASE 11)                         | `id` uuid                |
| `reservas`                  | Reservas de mesa por cliente, con estado y control de solapamiento (FASE 11.5)                   | `id` uuid                |

**Relaciones:**

- `personal.empresa_id` → `empresas.id` (`ON DELETE RESTRICT`)
- `personal.tipo_documento_identidad_id` → `tipos_documento_identidad.id` (`ON DELETE RESTRICT`)
- `usuarios.personal_id` → `personal.id`, **único** (1:1) (`ON DELETE RESTRICT`)
- `usuarios.rol_id` → `roles.id` (`ON DELETE RESTRICT`)
- `refresh_tokens.usuario_id` → `usuarios.id` (`ON DELETE CASCADE`)
- `roles_permisos` conecta `roles` ↔ `permisos` (`ON DELETE CASCADE` en ambos lados)
- `productos.categoria_id` → `categorias.id` (`ON DELETE RESTRICT`: no se puede borrar una categoría con productos)
- `productos.marca_id` → `marcas.id`, **nullable** (`ON DELETE RESTRICT`: no todo producto tiene marca, pero si la tiene no se puede borrar esa marca)
- `productos.unidad_medida_id` → `unidades_medida.id`, obligatoria (`ON DELETE RESTRICT`)
- `mesas.salon_id` → `salones.id`, obligatoria (`ON DELETE RESTRICT`); índice único compuesto `(salon_id, numero)` — el mismo número de mesa puede repetirse en salones distintos, no dentro del mismo salón
- `clientes.tipo_documento_identidad_id` → `tipos_documento_identidad.id`, **nullable** (`ON DELETE RESTRICT`); índice único compuesto `(tipo_documento_identidad_id, numero_documento)` — mismo patrón que `personal`, pero ambas columnas son nullable: un cliente puede no tener documento registrado, y si lo tiene, debe venir el tipo y el número juntos (validado en `cliente.service.ts`, no solo por la constraint de BD)
- `reservas.cliente_id` → `clientes.id`, obligatoria (`ON DELETE RESTRICT`)
- `reservas.mesa_id` → `mesas.id`, obligatoria (`ON DELETE RESTRICT`)

**Por qué este orden (Empresa → Personal → Usuario):** decisión explícita del usuario (2026-09-07). Un `usuario` (cuenta de acceso) siempre parte de un registro de `personal` ya existente (persona real, identificada por documento), y todo `personal` pertenece a una `empresa`. Esto evita datos de personas duplicados entre módulos futuros (ej. nombre/apellido no se repiten en `usuarios`) y prepara el sistema para "Múltiples sucursales" (expansión futura de `CLAUDE.md` sección 1): varias sucursales podrán colgar de una misma `empresa` sin rediseñar el núcleo de identidad.

**Notas de seguridad:**

- `usuarios.password_hash` tiene `select: false` a nivel de entidad: no se incluye en consultas por defecto. Nunca se expone en respuestas de la API.
- `refresh_tokens.token_hash` almacena el hash del token, no el token en texto plano.

**Índices:** únicos en `usuarios.email`, `usuarios.personal_id`, `roles.nombre`, `permisos.codigo`, `refresh_tokens.token_hash`, `empresas.ruc`, `tipos_documento_identidad.codigo`, `tipos_comprobante.codigo`, `clientes.email` (nullable, permite múltiples `NULL`), y compuesto único en `personal(tipo_documento_identidad_id, numero_documento)` y `clientes(tipo_documento_identidad_id, numero_documento)` (también nullable en ambas columnas: múltiples clientes sin documento no chocan entre sí); de rendimiento en `roles_permisos(rol_id)` y `roles_permisos(permiso_id)`.

**Nota sobre `clientes`:** a diferencia de `personal`, no tiene FK a `empresas` (no pertenece a una empresa, es un cliente externo) y su `tipo_documento_identidad_id` es **nullable** (no toda venta a un cliente requiere documento). Cuando se proporciona un documento, sí queda acoplado al mismo Catálogo SUNAT 06 que usa `personal` (decisión del usuario, 2026-09-07: "todo está acoplado de acuerdo a SUNAT") — reutiliza la misma validación de formato y el mismo botón de búsqueda RENIEC/SUNAT.

Este esquema es exclusivamente para el RBAC del personal interno. El login de clientes (portal público) será un dominio de identidad separado — ver `decisiones-tecnicas.md`.

## Catálogos SUNAT sembrados

Los catálogos se poblaron con los códigos oficiales más usados (subconjunto extensible, ver migración `SeedCatalogosSunat`):

**`tipos_documento_identidad`** (Catálogo 06): `0` Sin documento, `1` DNI, `4` Carné de Extranjería, `6` RUC, `7` Pasaporte.

**`tipos_comprobante`** (Catálogo 01): `01` Factura, `03` Boleta de Venta, `07` Nota de Crédito, `08` Nota de Débito, `09` Guía de Remisión - Remitente.

`tipos_comprobante` no tiene todavía ninguna tabla que lo referencie (se usará en FASE 14 Ventas / futura facturación electrónica SUNAT); se sembró ahora porque el usuario pidió que el diseño de base de datos siga los catálogos SUNAT desde el inicio.

**`unidades_medida`** (Catálogo 03, subconjunto de uso común): `NIU` Unidad, `KGM` Kilogramo, `GRM` Gramo, `LTR` Litro, `MLT` Mililitro, `PK` Paquete, `BX` Caja, `ZZ` Servicio. Usado hoy por `productos.unidad_medida_id`; se reutilizará para las cantidades de insumos cuando se implemente Recetas (FASE 18).

## Migraciones

Ubicación: `apps/backend/src/database/migrations/`.

| Comando (`pnpm --filter @restaurant-erp/backend <script>`) | Uso                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------ |
| `migration:generate <ruta>`                                | Genera una migración comparando entidades vs. esquema actual |
| `migration:run`                                            | Aplica las migraciones pendientes                            |
| `migration:revert`                                         | Revierte la última migración aplicada                        |
| `migration:show`                                           | Lista migraciones aplicadas/pendientes                       |

Migraciones aplicadas (en orden):

1. `EsquemaInicialRbac` — crea `usuarios`, `roles`, `permisos`, `roles_permisos`, `refresh_tokens`.
2. `EmpresaPersonalYCatalogosSunat` — crea `empresas`, `personal`, `tipos_documento_identidad`, `tipos_comprobante`; agrega `usuarios.personal_id` (FK única) y elimina `usuarios.nombre` (ahora vive en `personal`).
3. `SeedCatalogosSunat` — datos semilla de los catálogos SUNAT.
4. `SeedRbacInicial` — permisos base + rol Administrador + empresa/personal/usuario de arranque.
5. `SeedPermisosEliminar` — permisos `*.eliminar` para usuarios/personal/roles.
6. `CategoriaTabla` / `SeedPermisosCategorias` — crea `categorias` y sus permisos (FASE 8).
7. `ProductoTabla` / `SeedPermisosProductos` — crea `productos` (con `precio numeric(10,2)` e `imagen_url` nullable) y sus permisos (FASE 9).
8. `MarcaYUnidadMedidaTablas` — crea `marcas` y `unidades_medida`, agrega `productos.marca_id` (nullable).
9. `SeedUnidadesMedida` / `SeedPermisosMarcas` — datos semilla del catálogo y permisos de marcas.
10. `ProductoUnidadMedida` — agrega `productos.unidad_medida_id`: se crea **nullable primero**, se hace `UPDATE` de los productos ya existentes a la unidad `NIU` (Unidad), y recién entonces se pone `NOT NULL` + FK. Patrón a seguir cada vez que se agrega una columna obligatoria a una tabla que ya puede tener filas reales (no solo datos de prueba).
11. `SalonYMesaTablas` / `SeedPermisosSalonesMesas` — crea `salones` y `mesas` (con índice único `(salon_id, numero)`) y sus permisos (FASE 10).
12. `ClienteTabla` / `SeedPermisosClientes` — crea `clientes` (con índice único nullable en `email`, `numero_documento` sin catálogo todavía) y sus permisos (FASE 11).
13. `ClienteTipoDocumento` — acopla `clientes` a SUNAT (decisión del usuario, 2026-09-07): agrega `clientes.tipo_documento_identidad_id` (FK nullable a `tipos_documento_identidad`), reemplaza el índice único simple de `numero_documento` por uno compuesto `(tipo_documento_identidad_id, numero_documento)`, igual que `personal`.
14. `ReservaTabla` — crea `reservas`, con `estado` como **enum nativo de Postgres** (`reservas_estado_enum`: `pendiente`/`confirmada`/`cancelada`/`completada`, no un `varchar` libre) y FKs a `clientes`/`mesas`.
15. `SeedPermisosReservas` — permisos del módulo (FASE 11.5).

Todas las migraciones fueron probadas con `migration:run` → `migration:revert` → `migration:run` para confirmar que `up()`/`down()` son simétricos.
