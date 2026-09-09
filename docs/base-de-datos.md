# Base de datos y migraciones

## Motor y conexión

PostgreSQL 18 (Docker, ver `docker-compose.yml`). Conexión gestionada por TypeORM (`apps/backend/src/database/data-source.ts`), con `synchronize: false` en todo momento — el esquema se gestiona exclusivamente mediante migraciones.

## Esquema actual (FASE 2 — identidad base y RBAC de personal interno)

**Orden de dependencia (de raíz a hoja):** `empresas` → `personal` → `usuarios` → `refresh_tokens`, con los catálogos SUNAT (`tipos_documento_identidad`, `tipos_comprobante`) y el RBAC (`roles`, `permisos`, `roles_permisos`) como soporte.

| Tabla                       | Descripción                                                                                               | PK                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------ |
| `empresas`                  | Entidad legal/tributaria raíz del sistema (RUC, razón social)                                             | `id` uuid                |
| `tipos_documento_identidad` | Catálogo SUNAT N° 06 (DNI, RUC, CE, Pasaporte, etc.)                                                      | `id` uuid                |
| `tipos_comprobante`         | Catálogo SUNAT N° 01 (Factura, Boleta, N. Crédito, etc.)                                                  | `id` uuid                |
| `personal`                  | Personas físicas vinculadas a una empresa (staff), identificadas por un tipo+número de documento          | `id` uuid                |
| `usuarios`                  | Cuenta de acceso al sistema, 1:1 con un registro de `personal`                                            | `id` uuid                |
| `roles`                     | Roles asignables a usuarios (ej. Administrador, Cajero)                                                   | `id` uuid                |
| `permisos`                  | Permisos específicos (ej. `usuarios.crear`)                                                               | `id` uuid                |
| `roles_permisos`            | Relación N:M entre `roles` y `permisos`                                                                   | (`rol_id`, `permiso_id`) |
| `refresh_tokens`            | Tokens de refresco de sesión, por usuario                                                                 | `id` uuid                |
| `categorias`                | Categorías de la carta (FASE 8)                                                                           | `id` uuid                |
| `marcas`                    | Marcas de producto (ej. una gaseosa embotellada); opcional en `productos`                                 | `id` uuid                |
| `unidades_medida`           | Catálogo SUNAT N° 03 (Unidad, Kilogramo, Gramo, Litro, etc.)                                              | `id` uuid                |
| `productos`                 | Productos/platillos de la carta, con foto, marca opcional y unidad de medida (FASE 9)                     | `id` uuid                |
| `salones`                   | Ambientes del local donde se ubican las mesas (FASE 10)                                                   | `id` uuid                |
| `mesas`                     | Mesas físicas, pertenecen a un salón (FASE 10)                                                            | `id` uuid                |
| `clientes`                  | Clientes del restaurante, sin relación a `personal`/`empresas` (FASE 11; `razon_social` desde 2026-09-08) | `id` uuid                |
| `reservas`                  | Reservas de mesa por cliente, con estado y control de solapamiento (FASE 11.5)                            | `id` uuid                |
| `pedidos`                   | Pedido de una mesa (cabecera), con estado y total denormalizado (FASE 12)                                 | `id` uuid                |
| `detalle_pedidos`           | Líneas de producto de un pedido, con snapshot de precio (FASE 12)                                         | `id` uuid                |
| `comandas`                  | Ticket de cocina: grupo de líneas de un pedido enviadas a preparar juntas (FASE 13)                       | `id` uuid                |
| `tipos_afectacion_igv`      | Catálogo SUNAT N° 07 (Gravado/Exonerado/Inafecto) (FASE 14)                                               | `id` uuid                |
| `tipos_operacion`           | Catálogo SUNAT N° 17 (Venta interna, exportación...) (FASE 14)                                            | `id` uuid                |
| `medios_pago`               | Catálogo propio (Efectivo, Tarjeta, Yape, Plin...) (FASE 14)                                              | `id` uuid                |
| `ventas`                    | Comprobante (Boleta/Factura) emitido a partir de un pedido cerrado (FASE 14)                              | `id` uuid                |
| `detalle_ventas`            | Líneas de una venta, snapshot de precio/afectación IGV del detalle de pedido de origen (FASE 14)          | `id` uuid                |

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
- `pedidos.mesa_id` → `mesas.id`, **nullable** desde 2026-09-09 (`ON DELETE RESTRICT`): `null` = pedido "para llevar", sin mesa asignada; la regla de "un solo pedido `abierto` por mesa" solo aplica cuando sí hay mesa (ver `api.md`)
- `pedidos.cliente_id` → `clientes.id`, **nullable** (`ON DELETE RESTRICT`): identifica a qué cliente se le abrió el pedido; obligatorio solo cuando la mesa tiene una reserva activa de otro cliente en ese momento (ver `api.md`)
- `detalle_pedidos.pedido_id` → `pedidos.id`, obligatoria (`ON DELETE CASCADE`: una línea no tiene sentido sin su pedido; primer uso de CASCADE en este esquema fuera de `refresh_tokens`, ya que es una relación padre-hijo real, no un catálogo compartido)
- `detalle_pedidos.producto_id` → `productos.id`, obligatoria (`ON DELETE RESTRICT`: protege el historial de pedidos aunque el producto deje de existir)
- `comandas.pedido_id` → `pedidos.id`, obligatoria (`ON DELETE CASCADE`: una comanda no tiene sentido sin su pedido, mismo criterio que `detalle_pedidos.pedido_id`)
- `detalle_pedidos.comanda_id` → `comandas.id`, **nullable** (`ON DELETE RESTRICT`): `null` = línea todavía no enviada a cocina; una vez asignada a una comanda, la línea queda bloqueada para edición/borrado desde Pedidos hasta que la comanda se cancele (lo que libera la línea, poniendo `comanda_id` de vuelta a `null`)
- `productos.tipo_afectacion_igv_id` → `tipos_afectacion_igv.id`, obligatoria (`ON DELETE RESTRICT`)
- `ventas.pedido_id` → `pedidos.id`, **nullable** desde 2026-09-09 y **única** (`ON DELETE RESTRICT`): 1 pedido → a lo más 1 venta; `null` = venta directa (sin pedido de origen, líneas agregadas a mano). El índice único no necesitó volverse parcial: Postgres no considera iguales dos `NULL`, así que sigue impidiendo dos ventas del mismo pedido mientras admite cualquier cantidad de ventas directas (ver `api.md`)
- `ventas.cliente_id` → `clientes.id`, **nullable** (`ON DELETE RESTRICT`): obligatorio en la práctica solo para Factura (validado en el service, no por la BD)
- `ventas.tipo_comprobante_id` → `tipos_comprobante.id`, obligatoria (`ON DELETE RESTRICT`); índice único compuesto `(tipo_comprobante_id, serie, numero)` — el correlativo nunca se repite dentro de una misma serie/comprobante
- `ventas.tipo_operacion_id` → `tipos_operacion.id`, obligatoria (`ON DELETE RESTRICT`)
- `ventas.medio_pago_id` → `medios_pago.id`, **nullable** (`ON DELETE RESTRICT`): `null` cuando `forma_pago = credito` (se paga después, no hay instrumento todavía)
- `detalle_ventas.venta_id` → `ventas.id`, obligatoria (`ON DELETE CASCADE`: mismo criterio que `detalle_pedidos.pedido_id`)
- `detalle_ventas.producto_id` → `productos.id`, obligatoria (`ON DELETE RESTRICT`)
- `detalle_ventas.tipo_afectacion_igv_id` → `tipos_afectacion_igv.id`, obligatoria (`ON DELETE RESTRICT`) — snapshot del tipo de afectación del producto al momento de facturar

**Por qué este orden (Empresa → Personal → Usuario):** decisión explícita del usuario (2026-09-07). Un `usuario` (cuenta de acceso) siempre parte de un registro de `personal` ya existente (persona real, identificada por documento), y todo `personal` pertenece a una `empresa`. Esto evita datos de personas duplicados entre módulos futuros (ej. nombre/apellido no se repiten en `usuarios`) y prepara el sistema para "Múltiples sucursales" (expansión futura de `CLAUDE.md` sección 1): varias sucursales podrán colgar de una misma `empresa` sin rediseñar el núcleo de identidad.

**Notas de seguridad:**

- `usuarios.password_hash` tiene `select: false` a nivel de entidad: no se incluye en consultas por defecto. Nunca se expone en respuestas de la API.
- `refresh_tokens.token_hash` almacena el hash del token, no el token en texto plano.

**Índices:** únicos en `usuarios.email`, `usuarios.personal_id`, `roles.nombre`, `permisos.codigo`, `refresh_tokens.token_hash`, `empresas.ruc`, `tipos_documento_identidad.codigo`, `tipos_comprobante.codigo`, `clientes.email` (nullable, permite múltiples `NULL`), y compuesto único en `personal(tipo_documento_identidad_id, numero_documento)` y `clientes(tipo_documento_identidad_id, numero_documento)` (también nullable en ambas columnas: múltiples clientes sin documento no chocan entre sí); de rendimiento en `roles_permisos(rol_id)` y `roles_permisos(permiso_id)`.

**Nota sobre `personal` (2026-09-09):** `personal.razon_social` (nullable) y `personal.nombres` **nullable** — un registro de personal puede ser una persona jurídica (RUC que empieza en `20`), que se identifica por razón social y no tiene nombres ni apellidos; toda otra persona sigue usando `nombres`/`apellido_paterno`/`apellido_materno`. Son mutuamente excluyentes (regla en `personal.service.ts: resolverIdentidad`, la BD no la impone). A diferencia de `clientes`, `tipo_documento_identidad_id` y `numero_documento` **siguen siendo NOT NULL**: el personal es la raíz del núcleo de identidad y debe ser identificable.

**Nota sobre `clientes`:** a diferencia de `personal`, no tiene FK a `empresas` (no pertenece a una empresa, es un cliente externo) y su `tipo_documento_identidad_id` es **nullable** (no toda venta a un cliente requiere documento). Cuando se proporciona un documento, sí queda acoplado al mismo Catálogo SUNAT 06 que usa `personal` (decisión del usuario, 2026-09-07: "todo está acoplado de acuerdo a SUNAT") — reutiliza la misma validación de formato y el mismo botón de búsqueda RENIEC/SUNAT.

**`razon_social` (2026-09-08):** `clientes.nombres` pasó a **nullable** y se agregó `clientes.razon_social` (nullable). Son mutuamente excluyentes: un cliente con RUC de persona jurídica (empieza en "20") se identifica por razón social, no por nombres/apellidos — SUNAT no le asocia esos campos. Cualquier otro cliente (DNI, RUC "10"/"15"/"17" de persona natural, CE, Pasaporte, o sin documento) sigue usando nombres/apellidos como antes. La regla se aplica en `cliente.service.ts` (`validarNombreORazonSocial`), no a nivel de constraint de BD.

Este esquema es exclusivamente para el RBAC del personal interno. El login de clientes (portal público) será un dominio de identidad separado — ver `decisiones-tecnicas.md`.

## Catálogos SUNAT sembrados

Los catálogos se poblaron con los códigos oficiales más usados (subconjunto extensible, ver migración `SeedCatalogosSunat`):

**`tipos_documento_identidad`** (Catálogo 06): `0` Sin documento, `1` DNI, `4` Carné de Extranjería, `6` RUC, `7` Pasaporte.

**`tipos_comprobante`** (Catálogo 01): `01` Factura, `03` Boleta de Venta, `07` Nota de Crédito, `08` Nota de Débito, `09` Guía de Remisión - Remitente.

`tipos_comprobante` fue referenciado por primera vez en FASE 14 (`ventas.tipo_comprobante_id`) — se había sembrado desde FASE 2 porque el usuario pidió que el diseño de base de datos siga los catálogos SUNAT desde el inicio.

**`unidades_medida`** (Catálogo 03, subconjunto de uso común): `NIU` Unidad, `KGM` Kilogramo, `GRM` Gramo, `LTR` Litro, `MLT` Mililitro, `PK` Paquete, `BX` Caja, `ZZ` Servicio. Usado hoy por `productos.unidad_medida_id`; se reutilizará para las cantidades de insumos cuando se implemente Recetas (FASE 18).

**`tipos_afectacion_igv`** (Catálogo 07, FASE 14): `10` Gravado - Operación Onerosa, `20` Exonerado - Operación Onerosa, `30` Inafecto - Operación Onerosa. Usado por `productos.tipo_afectacion_igv_id` (default `10` para productos ya existentes) y snapshoteado en cada `detalle_ventas`.

**`tipos_operacion`** (Catálogo 17, FASE 14): `0101` Venta interna, `0200` Exportación de Bienes, `0201` Exportación de Servicios. En la práctica, un restaurante de un solo local con ventas presenciales siempre usará `0101` — se sembró el subconjunto igual que los demás catálogos, extensible sin tocar código si el negocio cambia (ej. exportación de servicios de catering).

**`medios_pago`** (catálogo propio, no numerado por SUNAT, FASE 14): `efectivo` Efectivo, `tarjeta_credito` Tarjeta de crédito, `tarjeta_debito` Tarjeta de débito, `transferencia` Transferencia bancaria, `yape` Yape, `plin` Plin.

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
16. `PedidosTabla` — crea `pedidos` (con `estado` como enum nativo `pedidos_estado_enum`: `abierto`/`cerrado`/`cancelado`, y `total numeric(10,2)` denormalizado) y `detalle_pedidos` (con `precio_unitario`/`subtotal numeric(10,2)`), con FKs a `mesas`/`productos` (FASE 12).
17. `SeedPermisosPedidos` — permisos del módulo (FASE 12).
18. `ComandasTabla` — crea `comandas` (con `estado` como enum nativo `comandas_estado_enum`: `pendiente`/`en_preparacion`/`listo`/`entregado`/`cancelada`) con FK a `pedidos`, y agrega `detalle_pedidos.comanda_id` (FK nullable a `comandas`) (FASE 13).
19. `SeedPermisosCocina` — permisos del módulo (FASE 13).
20. `PedidoCliente` — agrega `pedidos.cliente_id` (FK nullable a `clientes`), para poder validar que el cliente que abre un pedido en una mesa reservada sea el mismo que hizo la reserva (2026-09-08).
21. `CatalogosVentas` — crea `tipos_afectacion_igv`, `tipos_operacion`, `medios_pago` (FASE 14).
22. `SeedCatalogosVentas` — datos semilla de esos 3 catálogos.
23. `ProductoTipoAfectacionIgv` — agrega `productos.tipo_afectacion_igv_id`: mismo patrón nullable→backfill (`10` Gravado)→`NOT NULL`+FK que `ProductoUnidadMedida`.
24. `VentasTabla` — crea `ventas` (enum `ventas_forma_pago_enum`: `contado`/`credito`; enum `ventas_estado_enum`: `emitida`/`anulada`; índices únicos `(pedido_id)` y `(tipo_comprobante_id, serie, numero)`) y `detalle_ventas`, con FKs a `pedidos`/`clientes`/`tipos_comprobante`/`tipos_operacion`/`medios_pago`/`productos`/`tipos_afectacion_igv` (FASE 14).
25. `SeedPermisosVentas` — permisos del módulo (FASE 14).
26. `CamposEmpresa` — agrega `empresas.ubigeo` y `empresas.logo` (cambio en curso en paralelo, no documentado en detalle aquí; ver el módulo Empresa cuando se cierre esa fase de trabajo).
27. `ClienteRazonSocial` — `clientes.nombres` pasa a nullable y se agrega `clientes.razon_social` (ver nota de `razon_social` arriba).
28. `VentaTipoCambio` — agrega `ventas.tipo_cambio` (nullable), tipo de cambio USD/PEN de SUNAT en la fecha de emisión (ver `api.md`).
29. `PersonalRazonSocial` — mismo patrón que `ClienteRazonSocial`: `personal.nombres` pasa a nullable y se agrega `personal.razon_social`, para que un registro de personal con RUC de persona jurídica se identifique por razón social (2026-09-09).
30. `PedidoMesaVentaPedidoOpcionales` — `pedidos.mesa_id` y `ventas.pedido_id` pasan a nullable (pedidos "para llevar" y ventas directas, ver `api.md`); el `down()` falla si quedan filas con `NULL` en vez de corromperlas, obligando a resolver esos datos antes de revertir (2026-09-09).

Todas las migraciones fueron probadas con `migration:run` → `migration:revert` → `migration:run` para confirmar que `up()`/`down()` son simétricos.
