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

## Alcance de "sistema completo": Insumos/Recetas se posponen a su fase (2026-09-07)

El usuario pidió que el sistema fuera "completo" y no solo con "datos básicos", proponiendo que los platillos sean una receta de insumos con cantidades, además de marcas y unidades de medida SUNAT para productos.

- **Problema:** una receta real (platillo = mezcla de insumos con cantidad) depende de que exista un catálogo de Insumos con manejo de stock/costos, lo cual es la FASE 16 (Insumos/Inventario/Proveedores/Compras/Stock/Kardex) de `CLAUDE.md`, y Recetas es la FASE 18. Construir Recetas ahora habría significado saltarse ~6 fases del plan (Mesas, Clientes, Pedidos, Comandas/Cocina, Ventas, Caja) para llegar a Inventario, o construir un Insumo "de juguete" sin stock real que luego habría que rehacer.
- **Opciones presentadas:** (1) Insumos + Recetas básicos ahora, sin stock/compras/kardex todavía; (2) seguir el orden original del plan (FASE 10 Mesas es lo siguiente); (3) adelantar el inventario completo (Insumos+Proveedores+Compras+Stock+Kardex+Recetas) de una vez.
- **Decisión del usuario:** opción 2 — seguir el orden original. Insumos/Recetas se implementarán en su fase correspondiente (16 y 18), con el inventario real detrás, no antes.
- **Lo que sí se hizo ahora** (no requería reordenar el plan, son extensiones directas de Productos que ya existía): **Marcas** (catálogo propio del negocio, CRUD completo, opcional en un producto) y **Unidad de Medida** (Catálogo SUNAT N° 03, solo lectura, igual patrón que tipos de documento/comprobante) — ver `base-de-datos.md` y `roles-y-permisos.md`. La tabla `unidades_medida` ya seedeada se reutilizará tal cual cuando llegue Recetas, evitando duplicar ese catálogo más adelante.
- **Efecto secundario corregido:** al agregar la relación `productos → categorias`/`productos → marcas`, se descubrió que `categoria.service.ts`/`marca.service.ts` no impedían borrar una categoría/marca en uso (la violación de FK habría llegado como un 500 genérico en vez de un 409 claro). Se agregó el mismo pre-check que ya existía en `rol.service.eliminarRol` (contar productos que la referencian antes de borrar).

## Cliente acoplado al Catálogo SUNAT de documento de identidad (2026-09-07)

El usuario observó que "todo está acoplado de acuerdo a SUNAT" en el resto del sistema, y pidió que `Cliente` también tuviera tipo de documento de identidad y el mismo buscador RENIEC/SUNAT que ya tiene `Personal`, en vez del `numeroDocumento` de texto libre con el que se había construido en FASE 11.

- **Cambio de esquema:** `clientes.tipo_documento_identidad_id` (FK **nullable** a `tipos_documento_identidad`, el mismo catálogo que usa `personal`); el índice único de `numero_documento` pasó de ser simple a compuesto `(tipo_documento_identidad_id, numero_documento)`, igual patrón que `personal`. A diferencia de `personal`, ambas columnas siguen siendo opcionales (un cliente puede no tener documento registrado), pero el service exige que vengan juntas si se da alguna (`resolverDocumento` en `cliente.service.ts`) — no tiene sentido un tipo sin número ni un número sin tipo.
- **No duplicar código:** la búsqueda externa (`consulta-documento.service.ts`) y la validación de formato por tipo (`FORMATOS_DOCUMENTO`/`validarFormatoDocumento`) vivían dentro de `modules/personal/`, atadas a ese módulo. Al necesitarlas también en Clientes, se movieron a `modules/catalogos/` (son integraciones/reglas SUNAT compartidas, no algo específico de Personal) y ambos módulos las importan desde ahí. En el frontend, el campo de búsqueda que antes era una función interna de `Personal.tsx` se extrajo a `components/CampoBusquedaDocumento.tsx`, genérico sobre el formulario vía generics de react-hook-form, usado ahora por ambas páginas.
- **Impacto:** ninguno en datos reales — la tabla `clientes` estaba vacía al momento del cambio (Regla 2 de `CLAUDE.md`: se verificó antes de decidir si hacía falta backfill).

## Fix de layout: shell del panel admin no fijado al viewport (2026-09-07)

El usuario reportó "el sidebar es más pequeño que el tamaño de la página" al ver el Dashboard ya con varias secciones.

- **Causa:** `AdminLayout` tenía el contenedor exterior en `min-h-screen` (altura mínima, crece con el contenido) pero el `<aside>` (Sidebar) en `h-screen` (100vh, fijo). Cuando el contenido de `<main>` superaba la altura de la pantalla, el contenedor exterior crecía para acomodarlo pero el sidebar se quedaba en 100vh, dejando ver el fondo claro de la página debajo de él.
- **Fix:** contenedor exterior a `h-screen overflow-hidden`, columna derecha (Navbar+main) a `overflow-hidden` también, dejando que **solo `<main>`** haga scroll interno (`flex-1 overflow-y-auto`, ya lo tenía). Es el patrón estándar de "shell" para paneles admin: todo el shell fijo al viewport, una sola región interna scrolleable.
- **Regla general para futuras páginas:** nunca depender de que un hijo con `h-screen` "siga" a un padre en `min-h-screen` — si el padre puede crecer más allá de 100vh, hay que fijar el padre también (`h-screen overflow-hidden`) o el hijo se queda corto.

## "Rediseñar todo" reinterpretado como continuar la mejora incremental (2026-09-08)

El usuario pidió "que se rediseñe todo con diseño moderno... y un dashboard profesional", lo cual podía leerse como revisitar la decisión ya tomada el 2026-09-07 (mejora visual módulo por módulo, no rediseño transversal — ver más arriba en este documento).

- **Interpretación aplicada:** se tomó como "seguir subiendo el nivel visual de forma consistente, ahora también en el Dashboard y en los combos de selección", no como una orden de rehacer Usuarios/Personal/Roles/Empresa (que siguen con el diseño de tabla simple, deuda ya documentada) en esta misma sesión. Es la lectura consistente con la Regla 1/3 de `CLAUDE.md` (no modificar módulos innecesariamente) y con la decisión previa del usuario sobre este mismo tema.
- **Lo que sí se hizo:** (1) `components/ui/Combobox.tsx` — select con autocompletado, aplicado a los combos que el propio usuario señaló como ejemplo (cliente/mesa en Reservas) y, por el mismo criterio (lista que puede crecer, buscar por nombre es más rápido que un `<select>` largo), también a personal en Usuarios y a mesa/producto en Pedidos; se dejaron sin tocar los `<select>` de catálogos pequeños (categoría, marca, unidad de medida, salón, rol) por no aportar nada la búsqueda ahí. (2) Dashboard con fila de métricas reales "de hoy" y colores de icono variados en `StatCard` (antes todo era naranja). Detalle en `frontend.md`.
- **Si en una futura sesión el usuario confirma que quiere un rediseño transversal de todo el proyecto de una sola vez**, actualizar esta decisión y la de 2026-09-07 en consecuencia antes de proceder — no asumirlo de nuevo silenciosamente.

## Pedidos de mesa: alcance limitado a cabecera + líneas (FASE 12, 2026-09-08)

`CLAUDE.md` sección 15 ubica "Pedidos" en FASE 12, separado de "Comandas y cocina" (FASE 13) y "Ventas y pagos" (FASE 14). Había que decidir dónde cortar el alcance de `Pedido.estado` para no adelantar esas dos fases futuras.

- **Decisión:** `Pedido.estado` solo modela `abierto → cerrado` (fin de la atención, quedará disponible para que Ventas lo facture en su fase) o `abierto → cancelado`. No se agregó ningún estado de preparación/cocina (ej. "en preparación", "listo", "servido") — eso es responsabilidad conceptual de Comandas (FASE 13), que probablemente necesite su propio estado por línea de detalle, no en la cabecera del pedido. Tampoco se agregó ningún campo de pago/comprobante — eso es Ventas (FASE 14).
- **Por qué no esperar a diseñar las 3 fases juntas:** de por sí el plan las separa; construir Pedidos ya deja una base estable (cabecera + líneas con snapshot de precio + total recalculado) sobre la que Comandas puede añadir estado por línea y Ventas puede añadir una tabla `ventas` con FK a `pedidos` sin tener que rehacer nada de lo construido ahora.
- **Sin estado de "mesa ocupada" en la entidad Mesa:** en vez de agregarle un campo a `Mesa` (que rompería la Regla 3 de no tocar módulos existentes innecesariamente), la ocupación se deriva en el service de Pedidos consultando si existe un pedido `abierto` para esa mesa al crear uno nuevo (409 si ya existe). El frontend puede construir una vista de "mesas libres/ocupadas" cruzando `/api/mesas` con `/api/pedidos?estado=abierto` sin que el backend necesite exponer nada nuevo.

## Comandas: entidad propia en vez de un enum por línea (FASE 13, 2026-09-08)

La decisión de FASE 12 (ver arriba) dejó anotado que Comandas "probablemente necesite su propio estado por línea de detalle, no en la cabecera del pedido". Al implementarlo, había dos formas de leer eso: (a) agregar un enum de estado directamente a `DetallePedido`, o (b) agrupar líneas en una entidad `Comanda` que tiene el estado, y cada línea solo referencia a cuál comanda pertenece (o `null` si no se envió).

- **Decisión:** opción (b). Una comanda es un ticket de cocina real — el mesero suele enviar varias líneas juntas (ej. todos los platos de fondo de una mesa a la vez), y la cocina las prepara y actualiza como grupo, no línea por línea. Un enum suelto en cada `DetallePedido` habría obligado a la UI a mostrar y accionar un botón de estado por cada línea individual (3 líneas = 3 controles separados para lo que en la cocina es un solo ticket), y habría sido más fácil que dos líneas del mismo "envío a cocina" quedaran en estados inconsistentes entre sí sin ninguna razón de negocio.
- **Modelo resultante:** `Comanda` (cabecera con `estado`) + `detalle_pedidos.comanda_id` nullable (qué comanda cubre esa línea, si alguna). Envíos parciales quedan naturales: se puede mandar un subconjunto de líneas de un pedido ahora y el resto después, cada tanda en su propia comanda con su propio ciclo de vida.
- **Cruce con Pedidos ya construido:** esto obligó a tocar `pedido.service.ts` (Regla 3: modificación necesaria, no una elegida por comodidad) en tres puntos — bloquear editar/quitar una línea ya asignada a una comanda, y bloquear cerrar/cancelar el pedido mientras tenga alguna comanda no `entregada`/`cancelada`. La función que hace esa consulta (`existeComandaActivaParaPedido`) vive en `comanda.service.ts` (dueño del concepto) y Pedidos solo la llama — dependencia en una sola dirección (pedidos → comandas), sin importar nada de comandas hacia el archivo de servicio de pedidos, para no crear un ciclo real de módulos.
- **Nombre del módulo backend:** `modules/cocina/` (no `modules/comandas/`), porque la sección 4 de `CLAUDE.md` lista `cocina` como nombre de carpeta explícito. El recurso HTTP sigue llamándose `/api/comandas` (sustantivo del recurso, igual convención que el resto de la API).
