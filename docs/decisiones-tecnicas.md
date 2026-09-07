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

## Corrección: `moduleResolution` deprecado en tsconfig (2026-09-07)

- **Problema:** `tsconfig.base.json` usaba `"moduleResolution": "node"`. El schema oficial de `tsconfig.json` (usado por el editor) marca ese valor como **deprecado** (alias interno de `"node10"`), lo que el editor mostraba como error/advertencia sobre el archivo.
- **Decisión:** se cambió a `"module": "NodeNext"` + `"moduleResolution": "NodeNext"`, la configuración moderna recomendada para proyectos Node.js, consistente con la política de usar siempre la opción vigente no deprecada.
- **Impacto:** ninguno funcional. Se verificó `pnpm --filter @restaurant-erp/backend typecheck` sin errores tras el cambio.

## Rediseño del núcleo de identidad: Empresa → Personal → Usuario + catálogos SUNAT (2026-09-07)

Decisión explícita del usuario: la base de datos debe alinearse con los catálogos que usa SUNAT (ej. tipo de documento de identidad, tipo de comprobante), y todo el sistema debe partir de una tabla `Empresa`, luego `Personal` (que requiere un tipo de documento), y a partir de ese `Personal` se crea el `Usuario`.

**Desviación respecto a la lista de módulos de la sección 4 de `CLAUDE.md`:** esa lista no incluía módulos `empresa`, `personal` ni `catalogos`. Se agregan porque el usuario lo pidió explícitamente en esta conversación (autorización directa, sección 17/sección 4 de `CLAUDE.md` — "puedes adaptar la estructura si hay una razón técnica real, explicando el motivo"). El motivo: cumplimiento SUNAT desde el diseño de datos, y una jerarquía de identidad correcta (empresa → persona física → cuenta de acceso) que evita duplicar nombre/apellido entre `personal` y `usuarios`, y prepara el sistema para "Múltiples sucursales" (expansión futura ya prevista en `CLAUDE.md` sección 1).

**Cambios de esquema** (ver detalle completo en `base-de-datos.md`):

- Nuevas tablas: `empresas`, `personal`, `tipos_documento_identidad` (catálogo SUNAT 06), `tipos_comprobante` (catálogo SUNAT 01).
- `usuarios` pierde la columna `nombre` (duplicaba datos de persona) y gana `personal_id` (FK única 1:1 a `personal`).
- Migraciones `EmpresaPersonalYCatalogosSunat` y `SeedCatalogosSunat`, ambas probadas con `run` → `revert` → `run`.

**Alcance de esta fase:** solo el RBAC de personal interno usa esta jerarquía por ahora. El login de clientes (portal público) sigue siendo un dominio de identidad separado (ver sección anterior) y no usará `personal`/`empresas` de la misma forma — se diseñará en su fase correspondiente.

## Modo de avance: fases continuas sin esperar "CONTINUAR" (2026-09-07)

El usuario autorizó explícitamente avanzar de fase en fase sin esperar confirmación manual ("CONTINUAR"), reemplazando la Regla de Avance por defecto de la sección 16 de `CLAUDE.md` **solo para esta instancia del proyecto**, bajo la condición de que cada fase se valide (sin errores de tipos, lint, build y pruebas de migración) antes de seguir a la siguiente, y que todo quede documentado para poder retomar en una sesión futura (ver `estado-proyecto.md`).

## Corrección: proveedor DNI/RUC migró de dominio (2026-09-07)

- **Problema:** la búsqueda de DNI/RUC no funcionaba pese a tener `APIS_NET_PE_TOKEN` configurado. Causa raíz: **apis.net.pe migró su servicio a la infraestructura de Decolecta** (`https://api.decolecta.com/v1`), con un esquema de campos de respuesta distinto. El código seguía apuntando al dominio/versión antiguos (`api.apis.net.pe/v2`), que ahora rechaza cualquier token con "Token inválido".
- **Verificación:** se probó contra la API real con `curl` antes de tocar código (ver `api.md`), confirmando el nuevo dominio, el header `Authorization: Bearer` (sin cambios) y los campos reales de la respuesta.
- **Decisión:** actualizar la URL base por defecto y el mapeo de campos en `consulta-documento.service.ts`, sin cambiar de proveedor (sigue siendo apis.net.pe/Decolecta, ya aprobado). Se documenta aquí para que una futura sesión no repita el diagnóstico desde cero si el proveedor vuelve a cambiar algo.

## Nueva dependencia: `multer` para subida de imágenes (FASE 9, 2026-09-07)

- **Problema:** el usuario pidió imágenes para los productos de la carta. Express no incluye manejo de `multipart/form-data`; no existía ningún patrón de subida de archivos en el proyecto.
- **Opciones evaluadas:** (1) `multer` — middleware estándar de facto para Express, minimalista, sin servicio externo; (2) subir a un servicio cloud (S3/Cloudinary) — introduce una cuenta/costo externo y complejidad de configuración no solicitada; (3) aceptar imágenes como base64 en el JSON — infla el tamaño de las respuestas/DB innecesariamente.
- **Decisión:** opción 1, `multer` + almacenamiento en disco local (`apps/backend/uploads/`, fuera de git), servido vía `express.static`. Es una utilidad de la propia capa Express (no reemplaza ni compite con ninguna tecnología de la sección 2 de `CLAUDE.md`), de bajo riesgo y ampliamente usada.
- **Nota de seguridad aplicada:** Helmet bloquea por defecto la carga cross-origin de estáticos (`Cross-Origin-Resource-Policy: same-origin`); se relajó **solo** para la ruta `/uploads` a `cross-origin`, dejando el resto de cabeceras de Helmet intactas para el resto de la API.
- **Impacto/migración futura:** si más adelante se necesita CDN o múltiples sucursales con almacenamiento compartido, cambiar de disco local a un bucket es una migración acotada al `producto.service.ts`/`config/uploads.ts` (la URL pública ya es relativa, no absoluta al disco).

## Diseño visual: fotos con efectos en vez de 3D real (2026-09-07)

El usuario pidió "mejor diseño" para todo el proyecto y sugirió mostrar platillos en 3D en la carta.

- **Problema:** un visor 3D real requiere modelos `.glb` por platillo (fotografía 3D o modelado — un proceso de producción de contenido que el proyecto no tiene) más una librería nueva en el frontend (ej. `<model-viewer>` o Three.js), es decir, una decisión de stack + un problema de contenido que no se puede resolver solo con código.
- **Opciones presentadas al usuario:** (1) fotos modernas con efectos (zoom al hover, tarjetas animadas), sin librerías nuevas; (2) `<model-viewer>` de Google para productos que sí tengan un `.glb` (el usuario debería proveer/producir esos modelos); (3) omitir 3D por ahora.
- **Decisión del usuario:** opción 1. Además, en vez de rediseñar todas las páginas existentes de una sola vez, se acordó **elevar el estándar visual módulo por módulo** a partir de ahora (empezando por Productos/Carta en FASE 9), en vez de un rediseño transversal único — consistente con la Regla 1/3 de `CLAUDE.md` (desarrollo por fases, no modificar módulos innecesariamente).
- **Implementado en FASE 9:** tarjetas de producto con imagen, zoom suave al pasar el mouse (`hover:scale-110` con `overflow-hidden`), filtro por categoría, y el mismo tratamiento visual reutilizado entre el panel admin y la carta pública. La idea de 3D queda documentada aquí como posible ampliación futura (junto con QR/delivery/app móvil en la sección 1 de `CLAUDE.md`), condicionada a que el usuario provea o produzca los modelos `.glb`.
