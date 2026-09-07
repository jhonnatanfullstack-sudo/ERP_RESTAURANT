# Decisiones técnicas

## Política de versiones (2026-09-07)

Se usa siempre la versión estable más reciente de cada tecnología del stack. Cuando una versión reciente no es compatible con el resto de las herramientas obligatorias (sección 2 de `CLAUDE.md`), se documenta el conflicto aquí y se aplica una alternativa viable — nunca una degradación silenciosa sin explicación.

### Caso: TypeScript 7 vs. typescript-eslint

- **Problema:** TypeScript 7 (compilador reescrito en Go) es incompatible con `typescript-eslint` 8.x, que declara como peer dependency `typescript "<6.1.0"`. El parser de ESLint para TypeScript aún no soporta el nuevo compilador.
- **Opciones evaluadas:**
  1. Usar TypeScript 7 e ignorar el warning de peer dependency (riesgo alto: comportamiento no verificado, puede romper el linting basado en tipos).
  2. Reemplazar ESLint/typescript-eslint por otra herramienta compatible con TS7 (cambia una tecnología obligatoria del stack — requiere autorización explícita, sección 5/11 regla 5).
  3. Mantener TypeScript en la línea 5.x más reciente (última estable de esa serie), compatible con ESLint, TypeORM y todo el ecosistema actual.
- **Decisión:** Opción 3. Es la "versión más reciente compatible", no un downgrade arbitrario. Se revisará cuando `typescript-eslint` y TypeORM confirmen soporte oficial para TS7.
- **Impacto:** Ninguno funcional; el proyecto usa TypeScript 5.x más reciente disponible en todos los paquetes.

### Base de datos: PostgreSQL 18

- Se usa `postgres:18-alpine` (última versión estable) en Docker para desarrollo local.
- Nota técnica: la imagen oficial de PostgreSQL 18+ cambia el punto de montaje de datos a `/var/lib/postgresql` (antes `/var/lib/postgresql/data`). El `docker-compose.yml` del proyecto ya usa la convención nueva.

## Requisito: Carta pública para clientes (2026-09-07)

El sistema debe ser accesible tanto para usuarios internos de la empresa (staff, con login) como para clientes externos, que necesitan ver la carta/productos y precios sin autenticarse.

**Enfoque adoptado (confirmado por el usuario, 2026-09-07):**

- Un único frontend (`apps/frontend`), sin duplicar aplicación ni configuración (regla 7 de `CLAUDE.md`: no generar código duplicado). Incluye un grupo de rutas públicas (ej. `/carta`) sin guard de autenticación, junto a las rutas administrativas protegidas.
- El backend expone endpoints públicos de solo lectura (ej. `GET /api/public/carta`) sobre los módulos `categorias` y `productos` ya planificados (FASE 8 y FASE 9), separados de los endpoints administrativos protegidos por JWT/permisos.
- Los endpoints públicos llevan rate limiting propio (más estricto que el interno) por estar expuestos sin autenticación.
- No se crean módulos nuevos: se reutiliza el modelo de datos de `categorias`/`productos` ya definido en la arquitectura general.

Este enfoque se implementará al llegar a las fases correspondientes (FASE 4 frontend base, FASE 8-9 categorías/productos), no de forma anticipada.

## Evaluación: portal web para clientes — reservas, login, pago en línea (2026-09-07)

El usuario preguntó si, además de ver la carta, el cliente podría reservar mesa, iniciar sesión y pagar directamente en línea.

**Análisis por funcionalidad:**

| Funcionalidad         | Complejidad/Riesgo | Decisión                                                                                     |
| --------------------- | ------------------ | -------------------------------------------------------------------------------------------- |
| Ver carta             | Baja               | Ya aprobado (ver sección anterior)                                                           |
| Reservas de mesa      | Media              | **Aprobado.** Se añade como módulo nuevo al plan de fases                                    |
| Login de clientes     | Media-alta         | **Aprobado en concepto**, como dominio de identidad separado del RBAC de staff               |
| Pago directo en línea | Alta               | **Aprobado en concepto**, diferido a una fase futura con decisión de pasarela de pago aparte |

**Reservas de mesa:**

- No maneja datos de pago ni información especialmente sensible (nombre, teléfono, fecha/hora, mesa).
- Depende de los módulos `mesas`/`salones` (FASE 10) y `clientes` (FASE 11), que ya estaban planificados.
- **Se añade "Reservas" como módulo nuevo**, después de Clientes en el orden de fases, antes de Pedidos.
- No requiere cambios en el stack tecnológico ni en la arquitectura ya definida.

**Login de clientes:**

- **No se debe reutilizar la tabla `usuarios`/`roles`/`permisos`** que se construye en la FASE 2: ese sistema está diseñado para autorización granular de personal interno (permisos operativos como `caja.abrir`, `productos.crear`), no para cuentas de clientes externos.
- **Decisión:** cuando se implemente, será un dominio de identidad separado (tabla y endpoints de autenticación propios para clientes), reutilizando el mismo patrón JWT ya definido para el staff, pero sin compartir tablas ni lógica de permisos.
- No afecta la FASE 2 (que es exclusivamente para el esquema RBAC del personal interno).
- Se diseñará en detalle cuando el plan de fases llegue a esta funcionalidad.

**Pago directo en línea:**

- Mismo nivel de riesgo/complejidad que "Facturación electrónica SUNAT" y "Delivery", que el proyecto ya pospone explícitamente como funcionalidades futuras (sección 1 de `CLAUDE.md`).
- **No se debe manejar número de tarjeta directamente en el backend propio.** Cuando se implemente, será mediante checkout hospedado de una pasarela de pago externa (ej. Culqi, Niubiz o Mercado Pago, habituales en Perú dado que el proyecto ya referencia SUNAT), reduciendo el alcance de cumplimiento PCI-DSS.
- La elección de pasarela es una decisión técnica que requiere autorización explícita (sección 17 de `CLAUDE.md`) y se presentará cuando el plan de fases llegue a esta funcionalidad.
- No afecta la FASE 2.

**Conclusión:** el portal de clientes es viable y compatible con la arquitectura actual sin cambiar tecnologías. Se desarrolla de forma incremental, igual que el resto del sistema: Reservas se incorpora al plan de fases ahora; Login de clientes y Pago en línea quedan aprobados en concepto pero se diseñan e implementan en su fase correspondiente, no antes.
