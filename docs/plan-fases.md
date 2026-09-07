# Plan de fases

Orden base definido en la sección 15 de `CLAUDE.md` (no se modifica ese documento). Aquí se registran las fases adicionales acordadas con el usuario durante el desarrollo. Ver `decisiones-tecnicas.md` para el detalle de cada decisión.

| Fase     | Nombre                                                      | Origen                            | Estado     |
| -------- | ----------------------------------------------------------- | --------------------------------- | ---------- |
| 0        | Arquitectura y configuración inicial                        | `CLAUDE.md`                       | Completada |
| 1        | Monorepo y configuración del proyecto                       | `CLAUDE.md`                       | Completada |
| 2        | PostgreSQL + TypeORM + migraciones                          | `CLAUDE.md`                       | Completada |
| 3        | Sistema base del backend                                    | `CLAUDE.md`                       | Pendiente  |
| 4        | Sistema base del frontend (incluye rutas públicas de carta) | `CLAUDE.md` + decisión 2026-09-07 | Pendiente  |
| 5        | Usuarios                                                    | `CLAUDE.md`                       | Pendiente  |
| 6        | Roles y permisos                                            | `CLAUDE.md`                       | Pendiente  |
| 7        | Autenticación y autorización (staff)                        | `CLAUDE.md`                       | Pendiente  |
| 8        | Categorías (incluye endpoint público de carta)              | `CLAUDE.md` + decisión 2026-09-07 | Pendiente  |
| 9        | Productos (incluye endpoint público de carta)               | `CLAUDE.md` + decisión 2026-09-07 | Pendiente  |
| 10       | Salones y mesas                                             | `CLAUDE.md`                       | Pendiente  |
| 11       | Clientes                                                    | `CLAUDE.md`                       | Pendiente  |
| **11.5** | **Reservas de mesa**                                        | **Decisión 2026-09-07**           | Pendiente  |
| 12       | Pedidos                                                     | `CLAUDE.md`                       | Pendiente  |
| 13       | Comandas y cocina                                           | `CLAUDE.md`                       | Pendiente  |
| 14       | Ventas y pagos                                              | `CLAUDE.md`                       | Pendiente  |
| ...      | (resto sin cambios)                                         | `CLAUDE.md`                       | Pendiente  |

**Funcionalidades futuras aprobadas en concepto, sin fase asignada todavía** (se diseñan en detalle cuando les toque su turno, igual que Delivery/QR/SUNAT ya previstos en `CLAUDE.md` sección 1):

- Cuenta de cliente con login (dominio de identidad separado del RBAC de staff)
- Pago en línea directo (vía pasarela externa, decisión de proveedor pendiente)
