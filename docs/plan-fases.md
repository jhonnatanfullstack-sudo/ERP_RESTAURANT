# Plan de fases

Orden base definido en la sección 15 de `CLAUDE.md` (no se modifica ese documento). Aquí se registran las fases adicionales acordadas con el usuario durante el desarrollo. Ver `decisiones-tecnicas.md` para el detalle de cada decisión.

| Fase     | Nombre                                                                        | Origen                            | Estado     |
| -------- | ----------------------------------------------------------------------------- | --------------------------------- | ---------- |
| 0        | Arquitectura y configuración inicial                                          | `CLAUDE.md`                       | Completada |
| 1        | Monorepo y configuración del proyecto                                         | `CLAUDE.md`                       | Completada |
| 2        | PostgreSQL + TypeORM + migraciones (Empresa, Personal, catálogos SUNAT, RBAC) | `CLAUDE.md` + decisión 2026-09-07 | Completada |
| 3        | Sistema base del backend                                                      | `CLAUDE.md`                       | Completada |
| 4        | Sistema base del frontend (incluye rutas públicas de carta)                   | `CLAUDE.md` + decisión 2026-09-07 | Completada |
| 5        | Usuarios (y Personal/Empresa, base para poder crearlos)                       | `CLAUDE.md` + decisión 2026-09-07 | Completada |
| 6        | Roles y permisos                                                              | `CLAUDE.md`                       | Completada |
| 7        | Autenticación y autorización (staff)                                          | `CLAUDE.md`                       | Completada |
| 8        | Categorías (incluye endpoint público de carta)                                | `CLAUDE.md` + decisión 2026-09-07 | Completada |
| 9        | Productos (incluye endpoint público de carta; + Marcas y Unidad de Medida)    | `CLAUDE.md` + decisión 2026-09-07 | Completada |
| 10       | Salones y mesas                                                               | `CLAUDE.md`                       | Completada |
| 11       | Clientes                                                                      | `CLAUDE.md`                       | Completada |
| **11.5** | **Reservas de mesa**                                                          | **Decisión 2026-09-07**           | Completada |
| 12       | Pedidos                                                                       | `CLAUDE.md`                       | Completada |
| 13       | Comandas y cocina                                                             | `CLAUDE.md`                       | Completada |
| 14       | Ventas y pagos                                                                | `CLAUDE.md`                       | Pendiente  |
| ...      | (resto sin cambios)                                                           | `CLAUDE.md`                       | Pendiente  |

**Módulos agregados a la sección 4 de `CLAUDE.md`** (decisión 2026-09-07, ver `decisiones-tecnicas.md`): `empresa`, `personal`, `catalogos` (SUNAT). Ya implementados en FASE 2.

**Funcionalidades futuras aprobadas en concepto, sin fase asignada todavía** (se diseñan en detalle cuando les toque su turno, igual que Delivery/QR/SUNAT ya previstos en `CLAUDE.md` sección 1):

- Cuenta de cliente con login (dominio de identidad separado del RBAC de staff)
- Pago en línea directo (vía pasarela externa, decisión de proveedor pendiente)
- Facturación electrónica SUNAT (ya tiene su catálogo `tipos_comprobante` sembrado desde FASE 2)

## Modo de avance

Desde 2026-09-07, por instrucción explícita del usuario, se avanza de fase en fase **sin esperar confirmación manual**, siempre que cada fase pase sin errores (typecheck, lint, build, y pruebas de migración cuando aplique). Ver `estado-proyecto.md` para el estado exacto donde retomar.
