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

**Relaciones:**

- `personal.empresa_id` → `empresas.id` (`ON DELETE RESTRICT`)
- `personal.tipo_documento_identidad_id` → `tipos_documento_identidad.id` (`ON DELETE RESTRICT`)
- `usuarios.personal_id` → `personal.id`, **único** (1:1) (`ON DELETE RESTRICT`)
- `usuarios.rol_id` → `roles.id` (`ON DELETE RESTRICT`)
- `refresh_tokens.usuario_id` → `usuarios.id` (`ON DELETE CASCADE`)
- `roles_permisos` conecta `roles` ↔ `permisos` (`ON DELETE CASCADE` en ambos lados)

**Por qué este orden (Empresa → Personal → Usuario):** decisión explícita del usuario (2026-09-07). Un `usuario` (cuenta de acceso) siempre parte de un registro de `personal` ya existente (persona real, identificada por documento), y todo `personal` pertenece a una `empresa`. Esto evita datos de personas duplicados entre módulos futuros (ej. nombre/apellido no se repiten en `usuarios`) y prepara el sistema para "Múltiples sucursales" (expansión futura de `CLAUDE.md` sección 1): varias sucursales podrán colgar de una misma `empresa` sin rediseñar el núcleo de identidad.

**Notas de seguridad:**

- `usuarios.password_hash` tiene `select: false` a nivel de entidad: no se incluye en consultas por defecto. Nunca se expone en respuestas de la API.
- `refresh_tokens.token_hash` almacena el hash del token, no el token en texto plano.

**Índices:** únicos en `usuarios.email`, `usuarios.personal_id`, `roles.nombre`, `permisos.codigo`, `refresh_tokens.token_hash`, `empresas.ruc`, `tipos_documento_identidad.codigo`, `tipos_comprobante.codigo`, y compuesto único en `personal(tipo_documento_identidad_id, numero_documento)`; de rendimiento en `roles_permisos(rol_id)` y `roles_permisos(permiso_id)`.

Este esquema es exclusivamente para el RBAC del personal interno. El login de clientes (portal público) será un dominio de identidad separado — ver `decisiones-tecnicas.md`.

## Catálogos SUNAT sembrados

Los catálogos se poblaron con los códigos oficiales más usados (subconjunto extensible, ver migración `SeedCatalogosSunat`):

**`tipos_documento_identidad`** (Catálogo 06): `0` Sin documento, `1` DNI, `4` Carné de Extranjería, `6` RUC, `7` Pasaporte.

**`tipos_comprobante`** (Catálogo 01): `01` Factura, `03` Boleta de Venta, `07` Nota de Crédito, `08` Nota de Débito, `09` Guía de Remisión - Remitente.

`tipos_comprobante` no tiene todavía ninguna tabla que lo referencie (se usará en FASE 14 Ventas / futura facturación electrónica SUNAT); se sembró ahora porque el usuario pidió que el diseño de base de datos siga los catálogos SUNAT desde el inicio.

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

Todas las migraciones fueron probadas con `migration:run` → `migration:revert` → `migration:run` para confirmar que `up()`/`down()` son simétricos.
