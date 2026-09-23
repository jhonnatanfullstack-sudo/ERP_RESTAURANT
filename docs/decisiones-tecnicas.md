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
- **Ampliación (2026-09-09):** el usuario volvió a pedir "platillos en 3D" para la carta. Se profundizó la opción 1 (siempre elegida) con transformaciones CSS 3D genuinas — `perspective`/`rotateX`/`rotateY`/`translateZ` reales, no una simulación con sombras — sobre las mismas fotos: una vitrina "coverflow" (`components/public/CarruselPlatillos.tsx`) donde el platillo activo queda de frente y los vecinos se inclinan en perspectiva, más una inclinación 3D que sigue al cursor en las tarjetas de la grilla (`hooks/useInclinacion3D.ts`). Sigue sin ser un visor de modelos `.glb` — la condición de la decisión original (que el usuario provea o produzca ese contenido) no cambió — pero le da al pedido de "3D" una respuesta honesta y funcional con el contenido que el proyecto ya tiene. Ver `frontend.md`.

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

## Mesa reservada: solo el cliente de la reserva puede abrir el pedido (2026-09-08)

El usuario pidió: "si la mesa está reservada solo debería dejar utilizar para el mismo cliente que reservó; en todo caso que se indique que la mesa está reservada". Antes de este cambio, Pedidos y Reservas no se cruzaban entre sí — se podía abrir un pedido en una mesa con una reserva activa sin ninguna advertencia, y `Pedido` no tenía ningún campo `cliente`.

- **Cambio de esquema:** `pedidos.cliente_id` (FK **nullable** a `clientes`, `ON DELETE RESTRICT`) — nullable porque la mayoría de pedidos (clientes sin reserva, "walk-in") no necesitan identificar al cliente, igual que en `Cliente` mismo el documento es opcional.
- **Regla de negocio** (`pedido.service.ts: obtenerReservaActivaDeMesa`, en `crearPedido`): si existe una reserva `pendiente`/`confirmada` cuyo rango `[fechaHora, fechaHora+duracionMinutos)` cubre el instante actual, la mesa está "reservada ahora". Si el `clienteId` del pedido no coincide con el cliente de esa reserva (incluido el caso de no enviarlo), se rechaza con `409` indicando para quién y a qué hora está reservada.
- **No se tocó el módulo Reservas**: la consulta se hace desde Pedidos hacia `reservaRepository` directamente (dependencia en una sola dirección, mismo patrón ya usado para `existeComandaActivaParaPedido` en sentido Pedidos→Cocina). Reservas no sabe nada de Pedidos.
- **Frontend — "que se indique que está reservada"**: se resolvió en dos lugares en vez de uno solo, para que sea visible tanto al momento de abrir el pedido como en general:
  1. `Pedidos.tsx` — el combo de mesas anota "Reservada — `<cliente>` `<hora>`" en vez de la capacidad cuando aplica, y al seleccionar una mesa reservada aparece una alerta explicando quién la reservó, más un campo "Cliente" que pasa a ser obligatorio.
  2. `Mesas.tsx` — nueva columna "Ocupación" (derivada, sin tocar el backend de Mesas) que cruza `reservas`+`pedidos` ya cargados para mostrar `Libre`/`Reservada <hora>`/`Ocupada`, igual criterio de "no agregar un campo a la entidad Mesa" que ya se había decidido en FASE 12.
- **Nota de implementación (lint):** `Date.now()` llamado directamente en el cuerpo de un componente es marcado por la regla `react-hooks/purity` de este proyecto (React Compiler) como función impura; `new Date().getTime()` no dispara la misma regla y ya se usa en otras partes del proyecto (ej. `Dashboard.tsx`) — preferir esa forma para cálculos de "ahora" dentro de un componente.

## Ventas y pagos: alcance y catálogos SUNAT confirmados antes de implementar (FASE 14, 2026-09-08)

El usuario pidió explícitamente: "recordar que las formas de pago se utilizan de acuerdo al catálogo de SUNAT, lo mismo para el tipo de operación, IGV por el producto que es un servicio y cosas así". Dado que esto introduce entidades nuevas (`Venta`, `DetalleVenta`) cruzando un módulo ya construido (`Producto` necesita un campo nuevo obligatorio) y tiene implicancia legal/tributaria real, se presentó el plan completo (problema/opciones/recomendación/impacto, sección 17 de `CLAUDE.md`) antes de escribir código, con dos puntos explícitos a confirmar:

- **Medios de pago:** SUNAT define catálogos numerados para comprobante (01), documento de identidad (06), unidad de medida (03), afectación del IGV (07) y tipo de operación (17) — pero **no** para el instrumento de pago (efectivo/tarjeta/billetera digital) en una boleta o factura común (el único catálogo de "medio de pago" que SUNAT numera es para detracciones — bancos —, que no aplica aquí). Se le presentó esto al usuario para no fabricar un número de catálogo SUNAT inexistente; **decisión del usuario: usar una lista propuesta (Efectivo, Tarjeta de crédito, Tarjeta de débito, Transferencia, Yape, Plin) como catálogo propio**, sembrado igual que los demás catálogos (tabla `medios_pago`, no numerado por SUNAT, documentado explícitamente como tal para no confundir a alguien que revise el código después).
- **Emisión electrónica real a SUNAT:** la sección 1 de `CLAUDE.md` ya lista "Facturación electrónica SUNAT" como ampliación futura, no de esta fase. **Decisión confirmada del usuario: dejarla para más adelante** — `Venta` deja todo lo necesario listo (serie, correlativo, desglose de IGV, tipo de comprobante) para que una integración futura con un PSE/OSE solo tenga que generar y enviar el XML/UBL a partir de estos datos, sin tener que rediseñar el modelo.
- **Cálculo de IGV:** el precio de `Producto` ya se maneja en todo el sistema (Carta pública, Pedidos) como el precio final que paga el cliente, es decir, **con IGV incluido**. Se decidió mantener esa misma convención en Ventas en vez de introducir un "precio sin IGV" separado — evita tener que migrar todos los productos existentes o cambiar cómo se ingresa el precio en el formulario ya construido. `Producto.tipoAfectacionIgv` (nuevo, obligatorio, default `Gravado` vía backfill) determina si a una línea se le extrae IGV (18%: 16% + 2% IPM) o no.
- **Por qué `Venta` no vive dentro de `modules/pedidos/`:** aunque nace de un pedido cerrado, una venta es un concepto contable con su propio ciclo de vida (emitida/anulada) y sus propias reglas (comprobante, RUC, correlativo) que no tienen nada que ver con la operación de mesa — matiene la separación de responsabilidades ya usada entre Pedidos/Cocina (dos módulos que se relacionan pero no se fusionan).

## Cliente con razón social (persona jurídica) y buscador por documento en Pedidos/Ventas (2026-09-08)

**Problema:** el usuario pidió que en Pedidos y Ventas exista un apartado de búsqueda de cliente por DNI/RUC (con auto-registro desde RENIEC/SUNAT si no existe, y botón para el formulario manual), y observó que un cliente con RUC `20` (empresa) no tiene nombres/apellidos como persona natural, sino una razón social — pero `clientes.nombres` era `NOT NULL` y el formulario de Clientes solo pedía nombres/apellidos, sin importar el tipo de documento.

**Opciones consideradas:**

1. Mantener `nombres` obligatorio y, para RUC 20, meter la razón social dentro de `nombres` (como un solo campo). Simple, pero mezcla dos conceptos distintos y hace que el nombre de la columna mienta sobre su contenido.
2. Agregar `razonSocial` nullable, volver `nombres` nullable, y validar en el service que exactamente uno de los dos esté presente según si el documento es RUC persona jurídica (empieza en `20`) o no.

**Decisión: opción 2.** Se agregó `clientes.razon_social` (nullable) y se quitó el `NOT NULL` de `clientes.nombres` (migraciones `ClienteRazonSocial`). La regla ("RUC 20 ⇒ solo razón social; cualquier otro documento ⇒ solo nombres/apellidos") se centraliza en `cliente.service.ts` (`esPersonaJuridica` + `validarNombreORazonSocial`), reutilizando el mismo patrón ya existente de `resolverDocumento` (recalcular con el documento final tanto al crear como al editar). La misma regla se replica en el frontend (`utils/documento.ts: esRucPersonaJuridica`) solo para mostrar el campo correcto en el formulario — la validación real vive en el backend.

**Impacto:**

- `consulta-documento.service.ts` (RENIEC/SUNAT) ahora también decide, por el mismo prefijo de RUC, si el nombre que devuelve SUNAT va a `nombres` o a `razonSocial` — SUNAT no separa apellidos para persona natural con RUC (a diferencia de RENIEC con DNI), así que ese caso siempre llega como nombre completo en un solo campo.
- Nuevo componente compartido `CamposIdentidadCliente` (nombres+apellidos o razón social según el documento) evita duplicar esta lógica de UI entre `Clientes.tsx` y el nuevo `ClienteCrearModal`.
- Nuevo componente `BuscadorCliente` reemplaza el combo simple de cliente en Pedidos y Ventas (no en Reservas — el usuario pidió explícitamente solo esos dos módulos): busca en los clientes ya cargados, si no existe consulta RENIEC/SUNAT y ofrece registrar automáticamente, y siempre deja disponible el botón "+ Nuevo cliente" para el registro manual completo vía `ClienteCrearModal`.
- No se pudo probar en vivo el caso RUC `10` (persona natural con negocio) contra el proveedor real porque los números de prueba usados no existen en el registro de SUNAT (`"ruc no valido"`); se verificó en cambio con un RUC `20` real (`20131312955`) y por revisión de código que la rama `10`/`15`/`17` es el `else` simétrico de la misma condición ya verificada.

## Tipo de cambio SUNAT por fecha de emisión, no bloqueante (2026-09-08)

**Problema:** el usuario pidió que la venta consulte el tipo de cambio por la fecha de emisión y lo registre en la base de datos. El sistema solo cobra en soles (no hay operaciones en moneda extranjera), por lo que este dato es puramente de referencia contable, no funcional para el cobro.

**Decisión:** se agregó `catalogos/tipo-cambio.service.ts` (`consultarTipoCambio(fecha)`), que consulta el mismo proveedor ya usado para RENIEC/SUNAT (Decolecta, `GET /v1/tipo-cambio/sunat?date=YYYY-MM-DD`) y se llama desde `venta.service.ts` al crear la venta, guardando el "precio venta" en la nueva columna nullable `ventas.tipo_cambio numeric(10,3)` (3 decimales, la misma precisión que usa SUNAT). **La función retorna `null` ante cualquier falla** (sin token, proveedor caído, timeout) en vez de lanzar excepción — una venta en soles nunca debe bloquearse por un dato de referencia externo que no es necesario para completarla. Este es el mismo criterio de "graceful degradation" que ya usa `consultarDocumento` para RENIEC/SUNAT.

**Impacto:** ningún otro flujo depende de este valor; es solo informativo y se muestra en el modal de detalle de la venta en el frontend cuando está disponible.

## Fix: `Modal` como portal a `document.body` (2026-09-08)

**Problema (bug real, encontrado por verificación E2E):** `BuscadorCliente` se usa como campo dentro del `<form>` de "Nuevo pedido"/"Nueva venta", y su botón "+ Nuevo cliente" abre `ClienteCrearModal`, que renderiza su propio `<form>`. Como `components/ui/Modal.tsx` renderizaba su contenido inline (sin portal), el `<form>` del modal quedaba **anidado dentro del `<form>` padre en el DOM real** — HTML inválido que el navegador resuelve haciendo un submit nativo (GET con los campos como query string) en vez de dejar que React lo intercepte, perdiendo el estado del formulario padre (mesa seleccionada, etc.) y sin crear el cliente.

**Decisión (parte 1 — DOM):** cambiar `Modal` para que renderice con `createPortal(..., document.body)` en vez de inline — el mismo patrón que usan Radix/MUI para sus diálogos. El modal sigue siendo hijo en el árbol de React (conserva contexto, estado, eventos), pero su DOM real queda fuera del árbol del formulario que lo contiene, eliminando el anidamiento de `<form>` en el HTML sin tener que rediseñar `BuscadorCliente`/`ClienteCrearModal` ni ningún otro de los 14 usos existentes de `Modal`.

**Segundo bug descubierto por la re-verificación E2E:** el portal resuelve el HTML inválido, pero React hace _bubbling_ de eventos sintéticos por el **árbol de React, no por el DOM** (comportamiento documentado de `createPortal`). El `submit` del formulario del modal seguía burbujeando hasta el `onSubmit` del formulario padre (ej. "Nuevo pedido"), disparándolo silenciosamente en el mismo instante — creaba un pedido/venta fantasma vacío junto al cliente real, sin ningún indicio visual.

**Decisión (parte 2 — evento):** agregar `onSubmit={(e) => e.stopPropagation()}` en el `<div>` contenedor del portal en `Modal.tsx`. Al estar entre el `<form>` interno del modal y el resto del árbol de React (donde vive el formulario padre), corta el bubbling ahí para los 14 usos de `Modal` a la vez, sin tocar cada modal individualmente.

**Impacto:** corrige ambos problemas para todos los modales existentes y futuros por igual; no requiere cambios en ningún call site. Verificado en navegador real (Playwright): el `<form>` del modal ya no es descendiente del `<form>` padre en el DOM, y el submit del modal ya no dispara el `onSubmit` del formulario padre.

## Gráficos del dashboard: SVG propio en vez de una librería (2026-09-08)

**Problema:** el dashboard analítico necesita serie temporal, columnas, dona, ranking y medidor. La salida natural sería instalar una librería de gráficos (Recharts, Chart.js, ApexCharts), pero `CLAUDE.md` (sección 2 y 29 de `UI-UX-GUIDELINES.md`) exige no introducir tecnologías nuevas sin autorización explícita y no instalar librerías innecesarias.

**Opciones evaluadas:** (1) Recharts — la más usada con React, ~100 kB gzip y arrastra D3; (2) Chart.js + wrapper — dibuja en `<canvas>`, lo que complica accesibilidad, texto seleccionable y responsive; (3) componentes propios en SVG.

**Decisión:** componentes propios en SVG (`components/charts/`). Los cinco gráficos que necesita el ERP son geometría simple (escala lineal, `path`, arcos) y el proyecto ya tiene todo lo demás resuelto (Tailwind para estilos, lucide para iconos): ~600 líneas propias que se leen y se ajustan sin aprender la API de una librería, **cero dependencias nuevas** y control total del detalle visual (grosor de marca, separación de 2px entre marcas, anillo de superficie en los puntos, animaciones de entrada). El tamaño del bundle no cambió.

**Impacto / cuándo revisar:** si más adelante hacen falta gráficos con zoom, brush, ejes temporales reales, series apiladas complejas o mapas (posible en FASE 19, Reportes), reevaluar entonces con una librería — la decisión de hoy no pretende cubrir ese caso. Los componentes actuales son autocontenidos: cambiarlos por una librería sería reemplazar `components/charts/` sin tocar las páginas.

**Paleta de series validada, no elegida "a ojo":** `components/charts/paleta.ts` fija el orden de colores categóricos (`#2563eb`, `#ea580c`, `#0891b2`, `#db2777`, `#65a30d`, `#7c3aed`, todos pasos 600 de Tailwind salvo lime). Se validaron en espacio OKLab: banda de luminosidad, piso de croma, separación de pares adyacentes bajo protanopia/deuteranopia y contraste ≥ 3:1 sobre fondo blanco. **El orden es parte de la validación** (garantiza que dos segmentos vecinos de la dona se distingan con daltonismo), por lo que no debe reordenarse ni sustituirse un color sin volver a validar. Las series de un solo dato (área de ventas, columnas por hora, ranking) usan el naranja de marca, no un color por barra: la longitud ya comunica la magnitud.

**Métricas derivadas en el cliente, no endpoints nuevos:** `utils/metricas.ts` concentra el cálculo (agrupar por día/hora, ranking de productos, participación por medio de pago, delta porcentual) como funciones puras sobre los datos que las páginas ya piden. Es deliberado para esta fase: los reportes con agregación en SQL son FASE 19, y adelantarlos habría significado crear endpoints que esa fase tendría que rediseñar. Cuando llegue FASE 19, estas funciones son el contrato a replicar en el backend.

## Pedido sin mesa y Venta sin pedido de origen (2026-09-09)

**Problema:** el usuario pidió explícitamente que el formulario de Pedidos "no dependa únicamente de que haya una mesa disponible" y el de Ventas "no dependa únicamente de que haya un pedido disponible" — debía poder agregarse productos directamente en ambos casos, conservando la posibilidad de partir de una mesa o un pedido existente. Tal como estaban modelados, `Pedido.mesa` era una FK obligatoria (sin mesa libre, no se podía abrir ningún pedido — ni para venta de mostrador ni para llevar) y `Venta.pedido` también lo era, con `crearVenta` copiando sus líneas desde `Pedido.detalles` (sin un pedido `cerrado` sin facturar, no se podía emitir ningún comprobante).

**Opciones evaluadas para Pedidos:**

1. Dejar `mesa` obligatoria y modelar "para llevar" con una mesa-placeholder ficticia (ej. "Mostrador"). Descartada: una mesa falsa contaminaría reportes de ocupación y el módulo de Mesas, y viola la regla de "no complejidad innecesaria" — un pedido para llevar no es una mesa.
2. Agregar un campo `tipo: 'mesa' | 'para_llevar'` explícito además de `mesa` nullable. Descartada por ahora: el campo sería 100% derivable de `mesa IS NULL`, así que sería un dato redundante sin un caso de uso real que lo necesite hoy (se puede agregar después sin romper nada si aparece esa necesidad, ej. delivery con su propio tipo).
3. **Elegida:** `Pedido.mesa` pasa a nullable. Sin mesa, el pedido es "para llevar": no aplican ni la regla de "un solo pedido `abierto` por mesa" ni el cruce con reservas activas (ambas son, por definición, reglas _de la mesa_).

**Opciones evaluadas para Ventas:**

1. Generar un `Pedido` "fantasma" (sin mesa) por cada venta directa, y mantener `Venta.pedido` obligatorio. Descartada: infla la tabla `pedidos` con filas que no representan ninguna orden real de cocina/mesa, y arrastra reglas de Pedido (estados, comandas) que no aplican a una venta de mostrador.
2. Agregar un campo `Venta.mesa` propio (independiente de `pedido`) para poder anotar dónde se vendió una venta directa. Descartada: el pedido del usuario fue pull de consumo _desde_ una mesa/pedido existente, no asignar una mesa nueva a una venta suelta; el combo "Pedido a facturar" ya etiqueta cada opción por su mesa (`nombreMesa`), así que agregar el campo hubiera duplicado ese mismo dato sin un caso de uso que lo necesite.
3. **Elegida:** `Venta.pedido` pasa a nullable; el body de `POST /api/ventas` acepta `pedidoId` **o** `detalles` (líneas producto+cantidad), nunca ambos (`crearVentaSchema.refine()`). Una venta directa resuelve cada línea contra el catálogo de productos vigente, igual que `agregarDetalle` de Pedidos, y el snapshot fiscal (IGV, precio) usa la misma función (`calcularLinea`) sin importar el origen.

**Por qué no hizo falta un índice parcial en `ventas.pedido_id`:** Postgres no considera iguales dos valores `NULL` dentro de una columna `UNIQUE` (a diferencia de MySQL antes de 8.0, donde sí lo hacía) — el índice único ya existente sigue impidiendo dos ventas del mismo pedido, y admite cualquier cantidad de filas con `pedido_id = NULL` sin modificarse. Verificado insertando dos filas con `pedido_id = NULL` en una transacción de prueba y haciendo `ROLLBACK` (no en la base real).

**Impacto:** ninguna regla de negocio existente cambió para el camino "con mesa" / "desde un pedido cerrado" — ambos siguen exactamente igual que antes (mismas validaciones, mismos códigos de error). Todo el código que leía `pedido.mesa.numero`/`venta.pedido.mesa.numero` directamente (`Cocina.tsx`, `Dashboard.tsx`, `Mesas.tsx`, `PedidoDetalle.tsx`, `Pedidos.tsx`, `Ventas.tsx`) se migró a los helpers `utils/formato.ts: nombreMesa()`/`origenVenta()`, que son ahora la única fuente de verdad para mostrar "mesa o no" en toda la app — evita que un futuro punto de la UI vuelva a asumir que `mesa`/`pedido` nunca es `null`. Migración `PedidoMesaVentaPedidoOpcionales`, con `down()` que falla explícitamente si ya existen pedidos "para llevar" o ventas directas en la base (no los corrompe silenciosamente).

## Carta pública: "Mi pedido" es un mensaje de WhatsApp, no un `Pedido` real (2026-09-09)

**Problema:** el usuario pidió mejorar el diseño de la carta pública y agregar "cositas que el cliente pueda hacer, como un enlace a WhatsApp". La forma más completa de resolverlo sería dejar que el visitante arme un pedido real del sistema desde `/carta` — pero eso es exactamente el "portal de clientes" (login, pedidos, pago) que ya se evaluó y se dejó "aprobado en concepto, diferido a una fase futura" (ver más arriba, sección del portal de clientes, 2026-09-07): requiere un dominio de identidad de clientes separado del RBAC de staff, validaciones de mesa/disponibilidad para una visita anónima, y decisiones de UX (¿reserva una mesa? ¿es para llevar? ¿quién lo confirma?) que no vienen pedidas hoy.

**Opciones evaluadas:**

1. Crear un `Pedido` real (sin mesa, "para llevar" — ya es posible desde el cambio de esta misma sesión) al confirmar la selección en `/carta`, sin login de cliente. Descartada: un visitante anónimo podría crear pedidos sin límite (no hay CAPTCHA ni rate limit pensado para esto), y el restaurante no tendría forma de contactar a quien lo hizo si no se pide un teléfono — terminaría siendo un pedido real sin dueño verificable en el sistema.
2. Igual que la opción 1, pero pidiendo nombre y teléfono en un formulario antes de confirmar. Descartada por ahora: empieza a ser un mini-registro de cliente público, que es precisamente el "login de clientes" ya diferido — mezclarlo aquí adelanta esa fase sin la decisión explícita que esa sección pide.
3. **Elegida:** el pedido armado en la carta es un **borrador informal**, guardado solo en `localStorage` del navegador del visitante (nunca llega al backend), que se convierte en un mensaje de texto pre-armado hacia el WhatsApp del restaurante (`wa.me`). El restaurante lo recibe y lo confirma por ese mismo chat — es, en esencia, una versión más rápida de "escribir el pedido a mano por WhatsApp", que muchos restaurantes ya hacen hoy sin ningún sistema.

**Impacto:** cero cambios de arquitectura, cero superficie nueva de abuso (nada llega al servidor salvo las lecturas públicas ya existentes de productos/empresa), y resuelve literalmente lo pedido ("un enlace a wsp y cosas así") sin adelantar el portal de clientes. Cuando ese portal se implemente, este flujo puede coexistir (WhatsApp para quien no quiere loguearse) o migrarse a pedidos reales — no hay nada que deshacer, `useBandejaPedido` es un hook autocontenido que no toca ningún otro módulo.

## Caja: efectivo por rango de fecha (no un `caja_id` en Ventas) y permiso reutilizado para movimientos (2026-09-09)

**Problema 1 — cómo saber cuánto efectivo entró en una sesión de caja.** Al cerrar una caja hace falta sumar las ventas en efectivo del turno. La forma más directa sería agregar `ventas.caja_id` (FK nullable, seteada al emitir una venta con la caja abierta en ese momento).

**Opciones evaluadas:**

1. Agregar `ventas.caja_id`. Descartada: viola la Regla 3 de `CLAUDE.md` ("no modificar módulos existentes innecesariamente") sin necesidad real — obliga a tocar `venta.service.ts` (resolver la caja abierta en cada venta, decidir qué pasa si no hay ninguna abierta) para un dato que se puede reconstruir sin persistir nada nuevo en Ventas.
2. **Elegida:** `caja.service.ts` calcula el efectivo del turno consultando `Venta` por rango de fecha (`creadoEn` entre la apertura y el cierre de la sesión) y medio de pago = "Efectivo" (`medioPago.codigo === 'efectivo'`), en el momento de cerrar. Cero cambios en Ventas; el mismo criterio se replica en el frontend (`Caja.tsx`) solo para la vista previa en vivo, leyendo la caché ya cargada de `['ventas']`.

**Impacto:** si en el futuro se necesita saber "en qué caja se cobró esta venta concreta" (ej. para un reporte de FASE 19), sí haría falta el `caja_id` — hoy no hay ese requisito, así que no se adelantó.

**Problema 2 — qué permiso exige registrar un ingreso/egreso manual.** La sección 10 de `CLAUDE.md` predefine exactamente `caja.ver`, `caja.abrir`, `caja.cerrar` para este módulo (a diferencia de otros módulos, donde predefine el patrón genérico `.ver`/`.crear`/`.editar`/`.eliminar`) — no hay un cuarto código para "registrar movimiento".

**Opciones evaluadas:**

1. Inventar `caja.registrar_movimiento` (o similar). Descartada: la sección 17 de `CLAUDE.md` pide no introducir decisiones de este tipo sin evaluarlas explícitamente, y la sección 10 ya fija una lista cerrada para este módulo — sumar un cuarto código no pedido rompe esa lista sin una razón de negocio real (nadie pidió un rol que pueda registrar movimientos pero no abrir/cerrar caja).
2. **Elegida:** registrar un movimiento reutiliza el permiso `caja.abrir`, interpretado como "operar una caja ya abierta" (quien puede abrir una sesión es, por definición, quien la opera durante el turno). `caja.cerrar` queda reservado específicamente para el arqueo final, una acción de mayor responsabilidad que sí puede tener un titular distinto (ej. un supervisor cierra lo que abrió un cajero).

**Impacto:** si más adelante se pide un rol que registre movimientos sin poder abrir/cerrar caja, se puede introducir el cuarto permiso entonces con una migración nueva (aditiva, no rompe nada existente) — hoy esa necesidad no está pedida.

## Inventario: kardex normalizado y momento del descuento de stock (FASE 16, 2026-09-09)

**Problema:** el usuario pidió, en un solo mensaje, separar mercaderías de servicios, una tabla `existencias` con "todos los movimientos de un producto (stock compra, p_compra, stock ventas, precio venta, stock inicial, almacén de origen/destino, fecha de movimiento)", que el almacén pertenezca a una empresa, y que cada platillo descuente sus insumos al venderse. Antes de implementar, dos decisiones de diseño no venían resueltas por el mensaje y cambiaban sustancialmente el trabajo según la respuesta.

### Decisión 1 — forma de la tabla `existencias`: columnas anchas vs. kardex normalizado

**Opciones evaluadas:**

1. Seguir literalmente la lista de campos del usuario como columnas de una sola fila por ítem (`stock_compra`, `stock_ventas`, `stock_inicial`...). Descartada: dos eventos independientes (una compra y una venta del mismo ítem) no pueden escribir la misma fila sin pisarse, y "todos los movimientos" ya implica una fila por movimiento, no una fila resumen — la lista de campos describe qué datos importan, no la forma de la tabla.
2. **Elegida:** un kardex normalizado — `Existencia` es un movimiento por fila (`tipo`, `cantidad`, `costoUnitario`, `almacen`, `insumo` XOR `producto`, fecha), y el saldo de un ítem se calcula agregando (`SUM` con signo según `tipo`) en vez de guardarse. Es el diseño estándar de cualquier libro de inventario real (kardex), y traduce cada campo pedido a su equivalente normalizado: "stock compra/p_compra" → movimientos `tipo = compra` con su `costoUnitario`; "stock ventas/precio venta" → movimientos `tipo = venta_directa`/`consumo_cocina` (el precio de venta ya vive en `DetalleVenta`, no se duplicó); "stock inicial" → movimientos `tipo = inicial`; "almacén de origen o destino" → la FK `almacen` de cada movimiento (un solo almacén por fila porque cada movimiento es una entrada o una salida, nunca ambas a la vez — un traslado entre almacenes, si hiciera falta más adelante, sería dos movimientos, uno de salida y uno de entrada, no un campo "origen y destino" en la misma fila).

**Impacto:** el saldo nunca puede desincronizarse de su historial (es una consulta sobre el historial, no un campo aparte que alguien podría olvidar actualizar), y agregar un nuevo tipo de movimiento (ej. una merma) no requiere una columna nueva.

### Decisión 2 — cuándo se descuenta el stock de un platillo

**Problema:** "por cada platillo se tiene que descontar sus insumos" no decía en qué momento del flujo (Pedido → Comanda/cocina → Venta) debía ocurrir — venta, cierre de pedido, y entrega en cocina son tres puntos de enganche válidos, con impacto muy distinto en qué módulos había que tocar. Se le preguntó directamente al usuario.

**Respuesta del usuario:** el descuento debe ocurrir cuando la comanda pasa a `entregado` en cocina ("al preparar un platillo ya disminuye el stock de los insumos"), y ese mismo movimiento se enlaza después a la venta cuando se factura ("luego pasa a la venta"); para una venta directa (sin pedido, sin paso de cocina) el descuento ocurre en el mismo momento de la venta.

**Implementación:** `comanda.service.ts: actualizarEstadoComanda`, al transicionar a `entregado`, llama a `existencia.service.ts: registrarConsumoComanda` — crea un movimiento `consumo_cocina` por cada insumo de la receta (cantidad de la receta × cantidad vendida) o, si el producto es `mercaderia`, uno por su propio stock. `venta.service.ts: crearVenta` llama a `registrarConsumoVenta`, que **no vuelve a descontar** las líneas que ya tienen un `consumo_cocina` (les enlaza el `venta_id` para trazabilidad) — solo crea un movimiento `venta_directa` para las líneas que nunca pasaron por cocina (venta directa sin pedido, o una línea de pedido cuya comanda se canceló). Esto es seguro porque un pedido no puede cerrarse mientras tenga una comanda activa (regla ya existente de FASE 13): al momento de facturar, toda línea enviada a cocina ya está `entregado` o su comanda quedó `cancelada` (y volvió a `comanda_id = null`).

**Opción descartada:** descontar siempre al facturar (más simple de implementar, un solo punto de enganche). Se descartó porque el usuario pidió explícitamente el modelo de dos fases, y porque descontar al facturar no refleja el momento real en que el insumo se usa — el stock del sistema seguiría "disponible" mientras cocina ya lo consumió, dando una falsa sensación de existencias durante ese lapso.

**Impacto:** `venta.service.ts` tuvo que ampliar la consulta del pedido para cargar también `detalles.comanda` (antes solo cargaba `detalles.producto`) — es el único dato que le permite distinguir "ya se consumió en cocina" de "nunca se envió a cocina".

### Decisión 3 — alcance: qué queda para FASE 17/18

**Elegida:** `POST /api/existencias/movimientos` con `tipo: compra` es un registro manual sin proveedor asociado (FASE 17, Proveedores y Compras, sigue sin implementar); la receta guarda cantidad e insumo pero no calcula costo ni margen por platillo (FASE 18, Recetas y costos, sigue sin implementar). No se bloquea una venta por falta de stock — no fue pedido, y bloquear ventas reales por un módulo nuevo que muchos restaurantes todavía no configuran habría sido una regresión sorpresa para quien no usa Inventario; el stock simplemente puede quedar en negativo, visible en `/inventario`.

**Impacto:** ninguno de los dos módulos futuros necesita rediseñar lo ya construido — `Existencia.costoUnitario` y `RecetaInsumo` ya quedan en la forma que esas fases van a necesitar.

## Tasa de IGV configurable, e Insumo separado de Producto pero con IGV propio (2026-09-09)

### Tasa de IGV: verificación real, no un supuesto

El usuario cuestionó la tasa de IGV hardcodeada de FASE 14 (18%) y pidió verificarla. Se investigó contra `orientacion.sunat.gob.pe` (fuente oficial) y varias fuentes independientes: existe, desde 2026, un régimen especial de **10.5% IGV (8% IGV + 2.5% IPM)** para MYPE de restaurantes/hoteles/alojamiento turístico (Ley N° 31940, prorrogada/ajustada por las Leyes N° 32219 y 32387), que **no aplica automáticamente** — requiere que el negocio sea MYPE, facture hasta 1,700 UIT/año, tenga ≥70% de ingresos de esa actividad, no tenga vinculación económica con otro grupo, y se haya acogido explícitamente ante SUNAT (Formulario Virtual 621).

**Decisión (confirmada por el usuario):** la tasa de IGV pasa a ser un dato de `Empresa` (`acogidoRegimenMypeRestaurantes: boolean`), no una constante del sistema — porque distintos restaurantes que usen este software pueden estar o no acogidos, y el sistema no tiene forma de saberlo por sí mismo. `venta.service.ts` resuelve la tasa contra la empresa activa en cada venta, en vez de un `TASA_IGV` fijo.

### Insumo vs. Producto: se evaluó fusionarlos, se mantuvieron separados

**Problema:** el usuario propuso que un insumo fuera modelado como un `Producto` más (tipo mercadería/insumo), razonando que "el IGV va por producto". Se le presentaron dos opciones con sus impactos y dejó la decisión a criterio propio ("tómalo como sea"), pidiendo solo que se tuviera en cuenta que el costo de compra de un insumo afecta el costo del platillo que lo usa.

**Opciones evaluadas:**

1. **Fusionar**: un solo catálogo `Producto` con `tipo: mercaderia | servicio | insumo` (o un booleano `esVendible` separado). Requeriría: `Producto.categoria` y `Producto.precio` pasan a nullable (hoy son obligatorios porque todo `Producto` existente es vendible y aparece en la Carta); filtrar "excluir insumos" en cada endpoint/listado que ya usa `Producto` (carta pública, combos de Pedidos/Ventas, listado admin, Dashboard); `RecetaInsumo` pasaría a auto-referenciar `Producto` (patrón lista de materiales). Es el patrón que usan ERPs maduros como Odoo (`product.template` cubre bienes vendibles y materias primas con un solo `type`), pero ahí la categoría de venta y el precio de venta ya son opcionales por diseño desde el inicio — replicarlo aquí significa reabrir un módulo con mucha superficie ya construida en producción.
2. **Elegida — mantener separados, agregar `tipoAfectacionIgv` a `Insumo`**: `Producto.categoria`/`precio` siguen siendo obligatorios sin tocar nada de lo ya construido; `Insumo` gana su propio catálogo de afectación de IGV (mismo catálogo SUNAT que `Producto`, no uno nuevo). Esto resuelve la necesidad real detrás del planteo del usuario: SUNAT exonera del IGV la venta de productos agropecuarios frescos en su estado natural (Apéndice I de la Ley del IGV) — una verdura o una fruta comprada fresca suele venir exonerada aunque el platillo preparado con ella esté gravado, así que el insumo necesitaba su propia clasificación de IGV independiente de la del producto final, sin necesidad de que ambos fueran la misma entidad.

**Costo del platillo (el requisito que sí se atendió sin fusionar):** `Existencia.costoUnitario` ya registraba el costo de cada compra desde que se diseñó FASE 16; lo que faltaba era exponerlo de forma útil. Se agregó `existencia.service.ts: obtenerUltimosCostosInsumos()` (el costo de compra más reciente por insumo, cualquier almacén) y se enlaza tanto al listado de insumos (`GET /api/insumos`) como a cada línea de una receta (`GET/PUT /api/recetas/:productoId`), para que `Productos.tsx` muestre un costo estimado del platillo sumando `cantidad × ultimoCosto` de cada línea. Es deliberadamente informativo: no calcula margen contra `Producto.precio`, no se persiste, no bloquea nada — ese costeo real con margen es FASE 18 (Recetas y costos), que ahora puede construir sobre datos que ya existen (receta + costo de compra) en vez de diseñarlos desde cero.

**Detalle de arquitectura, no de negocio:** enlazar el costo dentro de `receta.service.ts` habría creado un ciclo de imports (`existencia.service.ts` ya importa `receta.service.ts` para descontar stock según receta; importar en sentido contrario habría cerrado el ciclo). Se resolvió en `receta.controller.ts`, la única capa que puede depender de ambos services sin problema.

**Impacto:** si en el futuro aparece una razón de negocio real para unificar (ej. reportes de costo que necesiten tratar insumos y mercadería exactamente igual), se puede reconsiderar entonces — hoy no hay una necesidad concreta que lo justifique, solo la similitud superficial de "ambos tienen IGV", que ya quedó resuelta sin fusionar.

## Costeo: costo neto de IGV, calculado al vuelo, y `resolverTasaIgv` extraído a Empresa (FASE 18, 2026-09-10)

**Problema.** FASE 16 dejó `Insumo.ultimoCosto`, que es el `costo_unitario` del movimiento de entrada más reciente — es decir, **el monto tal como se tipeó en la compra**. Con `Compra.incluyeIgv = true` (el caso normal en Perú: el proveedor factura con IGV incluido), ese número trae el IGV adentro. Usarlo como costo para calcular margen contra un valor de venta que sí está sin IGV compara peras con manzanas: infla el costo ~18% y subestima el margen.

**Opciones evaluadas.**

1. Cambiar `existencias.costo_unitario` para que guarde el valor neto. Descartada: rompe el significado del kardex (que debe registrar lo que efectivamente se pagó) y exigiría migrar datos ya registrados.
2. Usar el bruto y advertirlo en la interfaz. Descartada: el margen sería sistemáticamente incorrecto, y "incorrecto pero avisado" no es aceptable en el número con el que se fijan precios.
3. **Elegida:** derivar un costo neto propio para costeo, sin tocar lo existente. `obtenerCostosNetos()` toma `detalle_compras.valor_compra / cantidad` cuando el movimiento vino de una `Compra` (ya desglosado según el `tipoAfectacionIgv` del ítem y el `incluyeIgv` de esa compra), y cae a `existencias.costo_unitario` solo en movimientos manuales, marcándolos con `origenCosto: 'manual'` para que la interfaz advierta que ese costo no pasó por un comprobante.

**Impacto.** Ninguno sobre módulos existentes: `obtenerUltimosCostosInsumos()` (bruto) queda intacto y sigue alimentando la sugerencia de costo al registrar una compra. Conviven dos números con nombres distintos y visibles: "último costo de compra" (lo que se pagó, en Insumos/Compras) y "costo neto" (la base del margen, en Costos).

**El costeo no se persiste.** No hay tabla de costos ni columna `costo` en `productos`: se recalcula en cada consulta. Un costo congelado quedaría desactualizado en silencio con la siguiente compra, y la foto histórica de lo que costó una venta concreta ya la tiene el kardex, que sí guarda el costo del momento.

**Extracción de `resolverTasaIgv`.** Vivía privada dentro de `venta.service.ts`. El costeo necesita exactamente la misma tasa (para descontarle el IGV al precio de carta), y duplicarla habría creado dos fuentes de verdad de un valor tributario — el peor tipo de duplicación posible. Se movió a `modules/empresa/igv.service.ts` junto con `CODIGO_AFECTACION_GRAVADO` y el helper `esGravado()`, porque la tasa es un atributo de la empresa, no de la venta. `venta.service.ts` y `compra.service.ts` ahora la importan de ahí; el cálculo no cambió en ninguno de los dos.

## Carta pública: metadatos por JavaScript, no renderizado en servidor (2026-09-10)

**Problema.** El enlace de `/carta` se comparte por WhatsApp, y la vista previa mostraba el título genérico del `index.html` ("Restaurant ERP"), sin descripción ni foto. El nombre real del restaurante vive en la base de datos: el HTML estático no puede traerlo.

**Decisión.** Un hook (`useMetaDocumento`) fija `document.title` y las etiquetas Open Graph cuando llegan los datos de Empresa. **No se agregó renderizado en servidor ni prerenderizado**, que habría significado cambiar la arquitectura del frontend (hoy una SPA con Vite, sección 2 de `CLAUDE.md`) sin autorización.

**Límite conocido y aceptado.** Los rastreadores que no ejecutan JavaScript siguen viendo el `index.html`. Para una carta que se comparte de persona a persona por chat es suficiente; si en algún momento se busca posicionamiento en Google, ahí sí habría que evaluar SSR o prerenderizado — y eso es una decisión de arquitectura que requiere autorización previa.

## Multi-empresa: aislamiento con RLS de Postgres, no solo con filtros en los services (FASE 25, 2026-09-10)

**Problema.** El usuario pidió convertir el sistema en un producto que se pueda publicar: cada uso de demo es una empresa nueva, y la Empresa A no puede ver nada de la B. El sistema era mono-empresa: de 42 tablas, solo 3 tenían `empresa_id`, y varias restricciones únicas globales hacían **imposible** que dos empresas convivieran (una sola caja abierta en todo el sistema, un solo `B001`, un cliente por documento en toda la base, nombres de categoría únicos globalmente).

**Opciones evaluadas para el aislamiento.**

1. **Filtro por `empresa_id` en cada service.** Menos trabajo inicial. Descartada como única defensa: protege exactamente las consultas donde alguien se acordó de ponerlo. Con 32 services, SQL crudo en Reportes/Costeo/Kardex, y módulos que se siguen agregando, un olvido no es un bug cualquiera — es un restaurante viendo las ventas de otro.
2. **Base de datos por empresa.** Aislamiento máximo. Descartada: cada demo exigiría crear y migrar una base entera, y el panel del proveedor tendría que consultar N bases para un solo reporte de uso. Demasiado caro para pruebas de 15 días.
3. **Elegida (con el usuario): `empresa_id` en cada tabla + Row-Level Security de Postgres.** El filtrado lo hace la base de datos. Un filtro olvidado devuelve cero filas en vez de las de otro cliente.

**Cómo funciona.** Cada petición a `/api` abre una transacción (`middlewares/tenant.middleware.ts`) y fija `app.empresa_id` con `set_config(..., true)` — local a la transacción. `requireAuth` toma la empresa **del token firmado**, nunca de una cabecera o del cuerpo: si viniera del cliente, cambiar un valor bastaría para leer los datos de otro. Las políticas comparan `empresa_id` contra ese ajuste y **fallan cerrado**: sin ajuste no se ve ninguna fila.

**Por qué toda la petición es una transacción.** `set_config(..., true)` vive en la transacción. Con el pool de conexiones de TypeORM, dos consultas de la misma petición pueden tocar conexiones distintas; sin una transacción compartida, una correría sin empresa fijada. Un `SET` de sesión en lugar de `SET LOCAL` sería peor: quedaría pegado en la conexión y la siguiente petición vería los datos de otra empresa. Efecto lateral bienvenido: una escritura de varios pasos que falla a la mitad ya no deja el resultado incompleto.

**El hallazgo que hacía inútil todo lo anterior.** Con las políticas ya creadas, se verificó contra la base real y **el aislamiento no se aplicaba**: una consulta con `app.empresa_id` apuntando a otra empresa seguía devolviendo todas las filas. La causa es que el rol que crea la imagen oficial de Postgres desde `POSTGRES_USER` es superusuario, y **un superusuario se salta RLS siempre**, incluso con `FORCE ROW LEVEL SECURITY`. Sin ese hallazgo, el sistema habría quedado con el aparato completo de aislamiento y cero aislamiento real. Se resolvió separando dos roles: el dueño (`DB_USER`, superusuario) solo ejecuta migraciones; la aplicación se conecta con `DB_APP_USER`, sin `SUPERUSER` ni `BYPASSRLS`. Verificado después: sin contexto, 0 filas; con otra empresa, 0 filas; con la propia, sus datos.

**Desnormalización deliberada.** Las tablas hijas (`detalle_ventas`, `movimientos_caja`, `cuotas_venta`…) llevan `empresa_id` propio aunque podrían deducirlo del padre. Una política que tenga que buscar el `empresa_id` del padre con un `EXISTS` es más lenta y mucho más fácil de escribir mal; con la columna en cada tabla, la política es la misma línea en todas.

**El bypass es explícito y acotado.** `conBypassRls()` desactiva las políticas dentro de una transacción concreta. Lo usan tres lugares, cada uno por una razón transversal por definición: el login (busca un usuario por correo sin saber aún a qué empresa pertenece), el alta de una demo (verifica que el RUC y el correo no estén tomados por **ninguna** empresa) y el panel del proveedor. Concentrarlo en una función hace que auditar "¿qué código puede ver datos de todos los clientes?" sea leer un archivo, no revisar treinta services.

**`usuarios.email` sigue siendo único globalmente.** El login es solo correo + contraseña, sin selector de empresa: si un mismo correo pudiera pertenecer a dos empresas, no habría forma de decidir a cuál entrar. Es un límite conocido y aceptado — una persona que administre dos restaurantes necesita un correo por cuenta.

**`refresh_tokens` queda fuera de RLS.** Se consulta por el hash del token durante la renovación, cuando todavía no se sabe de qué empresa es la petición. El hash es un secreto de 256 bits, no un identificador adivinable; incluirla obligaría a ampliar el uso del bypass, que conviene mantener al mínimo.

## Cuentas de prueba, bloqueo por vencimiento y panel del proveedor (FASE 26, 2026-09-10)

**Alta autoservicio.** El usuario eligió que cualquiera pueda registrarse desde una página pública y obtener sus días de prueba al instante. `POST /api/demo/registrar` aprovisiona la empresa entera —rol Administrador con todos los permisos, personal, usuario y almacén principal— e inicia sesión de una vez: pedirle la contraseña otra vez a quien acaba de registrarse es fricción gratuita en el momento más frágil del embudo.

**Se exige RUC aunque sea una prueba.** Es un ERP peruano: sin RUC no se puede facturar, que es la mitad del sistema. Y al ser único, limita naturalmente el registro a una prueba por negocio real. Es la defensa principal contra el abuso; el límite de 5 registros por hora y por IP solo frena el ritmo de intentos.

**El vencimiento se deriva, no se almacena.** No hay columna "estado" que mantener al día: se compara `demoExpiraEn` contra el reloj en cada petición. Así no hace falta una tarea programada que marque las demos vencidas cada noche, y no existe la ventana en la que una demo ya venció pero la columna todavía dice que está activa.

**Al vencer queda en solo lectura, no bloqueada (decisión del usuario).** Se responde `402 Pago requerido` a las escrituras —distinto de `403`, que significaría "no tienes permiso"— y se deja pasar la lectura. El restaurante conserva lo que cargó, que es justamente el argumento para que contrate; bloquear todo solo lograría que perdiera su trabajo.

**El control vive dentro de `requireAuth`.** Es el único punto por el que pasan todas las rutas protegidas. Una comprobación que hay que acordarse de montar en 30 routers es una que tarde o temprano falta en alguno.

**Registro de uso agregado por día, no por petición.** La pregunta que responde es "¿esta demo se usa de verdad o la abrieron una vez?". Para eso basta con peticiones, escrituras y último acceso por día. Una bitácora petición por petición respondería lo mismo ocupando miles de veces más espacio — y la traza fina de quién hizo qué ya la lleva `registros_auditoria` desde FASE 20.

**El proveedor es un eje aparte del RBAC.** `usuarios.es_proveedor` solo se activa por migración, nunca por la API: si fuera editable desde la gestión de usuarios, el administrador de cualquier restaurante podría ascenderse y leer los datos de todos los demás. El panel responde `404` (no `403`) a quien no lo es: a quien no corresponde no se le confirma siquiera que exista.

**La carta pública pasó a `/carta/:slug`.** `GET /api/empresas/publico` devolvía "la empresa activa más antigua", una respuesta que dejó de tener sentido con más de un restaurante. El slug se deriva del nombre comercial porque ese enlace se comparte por WhatsApp y se dicta por teléfono: `/carta/el-fogon` se lee, un UUID no.

## Pruebas integrales contra un Postgres real, no contra mocks (FASE 22, 2026-09-11)

**Problema.** El proyecto llegó a la FASE 22 sin una sola prueba automatizada. Toda la
verificación había sido manual, y ya había suficiente lógica acumulada (IGV, kardex,
correlativos, costeo, aislamiento) como para que una regresión pasara inadvertida.

**Nueva dependencia: Vitest** (más `supertest`, `@types/supertest` y `@types/pg`). Se eligió
sobre Jest porque el frontend ya corre sobre Vite: no es un ecosistema nuevo, es el mismo
motor, y entiende TypeScript sin configuración extra. `supertest` ejerce la API a nivel HTTP
contra la propia `app` de Express, sin levantar un servidor.

**Decisión central: las pruebas corren contra una base de datos real.** Las garantías más
importantes de este sistema **viven dentro de Postgres**, no en el código: las políticas RLS
que aíslan una empresa de otra, el índice único del correlativo de comprobantes, el índice
parcial de la caja abierta, el `CHECK` del food cost. Una prueba con el repositorio simulado
verificaría que el código llama a TypeORM — no que un restaurante no puede leer las ventas de
otro, que es lo que en realidad hay que garantizar.

La evidencia es directa: los tres errores encontrados al construir las FASES 25-26 —el rol
superusuario que se saltaba RLS, la transacción que confirmaba después de responder, la
migración que no marcaba a ningún proveedor— eran **todos invisibles para un mock**.

**Las pruebas se conectan con el rol restringido** (`DB_APP_USER`), igual que la aplicación en
producción. Si usaran el rol dueño, las pruebas de aislamiento pasarían siempre, incluso con
las políticas rotas, porque un superusuario lo ve todo. Ese detalle es lo único que hace que
signifiquen algo.

**La base se recrea y se migra en cada ejecución**, con el comando real (`pnpm
migration:run`). Limpiar tablas habría sido más rápido, pero entonces las migraciones nunca
se probarían: un índice o una política que solo existieran en la base de desarrollo —porque
alguien los creó a mano— pasarían desapercibidos para siempre.

**Tres obstáculos técnicos y por qué se resolvieron así:**

1. `global-setup.ts` **no importa nada de `src/`**. Vitest lo carga en el proceso principal,
   fuera de la canalización que transforma el código, y el grafo de entidades con decoradores
   revienta ahí.
2. Las migraciones se aplican **en un subproceso**. TypeORM carga los archivos de migración
   con `require`, y ese proceso no interpreta TypeScript: falla al primer `public async up`.
   Delegar en el comando real resuelve eso y, de paso, verifica en cada ejecución que ese
   comando sigue funcionando.
3. `setup.ts` vacía la lista de migraciones antes de `initialize()`, por el mismo motivo:
   TypeORM las carga al conectar aunque no vaya a ejecutarlas.

**Los limitadores de peticiones se desactivan con `NODE_ENV=test`** (login y registro de
demos). Las pruebas inician sesión y crean empresas decenas de veces desde la misma "IP": con
los límites activos, a mitad de la suite todo empezaría a fallar con 429, hablando de algo
que no es lo que se pretende probar.

**Hallazgo de la fase: la auditoría había dejado de registrar.** La bitácora se escribe en
`res.on('finish')`, y al pasar el sistema a una transacción por petición esa escritura empezó
a fallar con "Driver not Connected" — la conexión ya había vuelto al pool. Como el middleware
se traga el error a propósito (que la auditoría esté caída no puede tumbar una venta), **la
bitácora quedaba vacía sin que nada lo avisara**. Se corrigió con
`ejecutarFueraDeLaPeticion()`, que abre una conexión propia con la empresa fijada; además es
lo semánticamente correcto, porque una entrada de auditoría debe sobrevivir aunque la
operación auditada haya fallado y revertido. Quedó fijada con una prueba que comprueba el
**resultado en la base**, no la ausencia de excepción: el modo de fallo de ese módulo es
precisamente no dejar rastro.

## Preparación para producción: fallar temprano y ruidosamente (FASE 23, 2026-09-11)

El criterio de toda la fase: **un servicio que no arranca se arregla en minutos; uno que
arranca mal configurado puede estar meses filtrando datos sin que nadie lo note.** De ahí que
las comprobaciones sean bloqueantes en producción y solo avisos fuera de ella.

**Verificación al arrancar (`config/verificar-entorno.ts`).** Antes de aceptar tráfico se
comprueba que los secretos no sean los del `.env.example`, que tengan largo suficiente, que el
de acceso y el de refresco sean distintos (con el mismo, un token de acceso caducado sirve
como token de refresco y su corta duración deja de significar algo), y que `CORS_ORIGIN` no
apunte a localhost ni a `*`.

La comprobación más importante consulta `pg_roles`: **si el rol de la aplicación es
`SUPERUSER` o tiene `BYPASSRLS`, el servidor se niega a arrancar en producción.** Un
superusuario se salta las políticas RLS siempre, y el sistema seguiría funcionando con
normalidad mientras cualquier restaurante lee los datos de los demás — sin un solo síntoma
visible. Es exactamente el error que apareció al construir la FASE 25 y que solo se detectó
comprobándolo contra la base. Verificado: apuntando la aplicación al rol dueño, el arranque
falla con el mensaje y la referencia al documento.

**Registro propio en vez de `pino`/`winston` (`utils/logger.ts`).** Lo único que hace falta es
emitir una línea JSON por evento, y eso cabe en un archivo. Si algún día hay que enviar los
registros a un servicio externo, rotarlos o muestrearlos, ese es el momento de cambiar a
`pino` — y este módulo es la única superficie a reemplazar. Se eligió así para no sumar una
dependencia por algo que no la necesita todavía (regla 5 de `CLAUDE.md`). Detalle no obvio:
los errores se serializan a mano porque `JSON.stringify(error)` devuelve `{}` — `message` y
`stack` no son enumerables, y ese descuido deja los registros de producción con errores
vacíos.

**Identificador de traza por petición.** Cada petición recibe un `x-request-id` que viaja de
vuelta en la respuesta y aparece tanto en el registro de la petición como en el del error. Un
usuario puede reportar "me salió esta referencia" en vez de "me falló hace un rato", y el
registro aparece de inmediato. La respuesta de error 500 lo incluye en `details`.

**Dos health checks distintos, a propósito.** `/health` (vida) **no** consulta la base: si el
orquestador reiniciara la instancia cada vez que Postgres tiene un hipo, convertiría una
interrupción de la base en una tormenta de reinicios que la empeora. `/health/listo`
(disponibilidad) sí la consulta, porque sin base **ninguna** ruta funciona — con el
aislamiento apoyado en RLS, una consulta sin conexión no devuelve datos parciales, no devuelve
nada. Esa es la que hay que configurar en el proveedor de hosting.

**Apagado ordenado.** Cada despliegue envía `SIGTERM` al proceso anterior. Sin manejarlo, las
peticiones en vuelo se cortan y sus transacciones quedan abiertas hasta que Postgres las
descarta — y con una transacción por petición, eso es una venta a medio grabar. El orden
importa: primero `/health/listo` pasa a 503 (para que el balanceador deje de mandar tráfico),
después se dejan de aceptar conexiones, luego se espera a que terminen las en curso y recién
al final se cierra el pool. **Bug encontrado al probarlo:** `server.close()` devuelve
`ERR_SERVER_NOT_RUNNING` cuando ya había dejado de escuchar, y tratarlo como fallo hacía que
el proceso saliera con código 1 en **cada** apagado; un contenedor que siempre "falla" al
detenerse ensucia los registros y puede disparar alertas falsas.

**Nota de entorno:** el apagado ordenado no se puede probar con `kill -TERM` en Windows, que
no implementa señales POSIX y mata el proceso de golpe. Se verificó emitiendo la señal dentro
del proceso; en los contenedores Linux donde se despliega, la señal es real.

**Respaldos que se verifican restaurando (`scripts/respaldo-bd.sh`).** Un respaldo que nunca
se restauró no es un respaldo. El subcomando `verificar` lo restaura en una base temporal,
cuenta tablas y **políticas RLS**, y falla si faltan: un volcado sin ellas restauraría un
sistema que funciona pero con los datos de todos los clientes visibles entre sí, y eso no se
nota a simple vista. Funciona con el cliente de Postgres instalado o, si no está, a través del
contenedor de Docker — que es el caso en Windows. Verificado de punta a punta: 44 tablas y 33
políticas restauradas.

**Dockerfile en dos etapas.** La imagen final no lleva TypeScript, Vitest ni los `@types`, y
corre como el usuario `node` sin privilegios. Las migraciones **no** se ejecutan al arrancar,
a propósito: con dos instancias, dos migraciones simultáneas sobre la misma base es la forma
más rápida de corromperla.

## Geografía multi-país y envío de comprobantes vía OSE (FASE 27, 2026-09-15)

**Problema.** El usuario pidió transformar el sistema en SaaS e investigar los parámetros de
SUNAT para completar la facturación electrónica, con la app preparada para identificar
país/departamento/provincia/distrito de quien se registra, pensando en más países a futuro. Al
revisar el código antes de tocar nada (regla 18 de `CLAUDE.md`) se encontró que **la
transformación a SaaS ya estaba hecha** (FASE 25-26: RLS por empresa, registro público, panel
de proveedor) y que la facturación electrónica ya tenía la entidad, el XML UBL 2.1 y la firma
digital construidos, solo sin conectar. Lo que sí faltaba por completo era la geografía: `Empresa`
solo tenía un `ubigeo` de texto libre, sin catálogo de países ni de divisiones administrativas.

**Dos decisiones de arquitectura, presentadas al usuario antes de escribir código (sección 17
de `CLAUDE.md`) y confirmadas con `AskUserQuestion`:**

1. **Envío de comprobantes: vía OSE de terceros, no directo a SUNAT.** El sistema es
   multi-empresa (cada restaurante-cliente tiene su propio RUC y su propio certificado).
   Conectar directo a SUNAT (SEE) obliga a mantener las reglas de validación de cada catálogo
   y absorber cada cambio normativo (ej. el Catálogo N° 25, con nuevas reglas ya aplazadas por
   SUNAT de agosto 2026 a enero 2027). Un OSE (ej. NubeFacT, Efact) traslada ese mantenimiento
   al proveedor. **Pendiente de implementación** (FASE 28): elegir el proveedor concreto y
   verificar contra su manual técnico oficial que el producto usado acepte **XML ya firmado**
   (no el que arma el XML desde una "trama" JSON propia, que dejaría muerto
   `facturacion/ubl/factura.builder.ts` y `facturacion/firma/firmador.ts`, ya construidos).
2. **Modelo geográfico multi-país ya, no Perú-only.** Se optó por una tabla genérica
   `divisiones_administrativas` autorreferenciada por `padre_id` con un `nivel` (1/2/3) en vez
   de tablas separadas `departamentos`/`provincias`/`distritos`: cada país organiza su
   territorio distinto (estados, cantones, comunas...), y una jerarquía genérica no cambia de
   esquema al sumar un país nuevo — solo se agregan filas. Es **solo estructura de datos**: no
   se implementó ninguna regla tributaria de otro país (sigue fuera de alcance, sección 1 de
   `CLAUDE.md`).

**Por qué no se tocó la columna `ubigeo` de `Empresa`.** Ya la usa directamente
`factura.builder.ts` en el XML UBL. En vez de reemplazarla, `Empresa` ganó `pais_id`/
`distrito_id` (FK nullable) y `ubigeo` pasó a **derivarse** de `distrito.codigo` cuando hay
distrito elegido — pero se mantiene editable a mano para una empresa sin distrito (otro país, o
que todavía no lo cargó). Aditivo, no rompe nada existente (regla 3 de `CLAUDE.md`).

**De dónde salió la data real.** Se descargó de fuentes públicas en vez de inventarla o
tipearla a mano: ISO 3166-1 de
[lukes/ISO-3166-Countries-with-Regional-Codes](https://github.com/lukes/ISO-3166-Countries-with-Regional-Codes)
(249 países) y el UBIGEO completo de Perú de
[RitchieRD/ubigeos-peru-data](https://github.com/RitchieRD/ubigeos-peru-data) (actualizado a
2024; 25 departamentos, 196 provincias, 1892 distritos — más que los ~1874 de INEI porque
incluye distritos creados después). Ambos datasets se transformaron a JSON con la forma que la
migración necesita (`database/seeds/paises-iso3166.json`, `database/seeds/ubigeo-peru.json`) y
se verificó su integridad antes de sembrarlos: sin duplicados, sin huérfanos (cada provincia
apunta a un departamento real, cada distrito a una provincia real).

**Verificado de punta a punta:** registro público con `distritoId` real → `GET /api/empresas`
devuelve `pais`/`distrito` con la cadena `distrito.padre.padre` completa y `ubigeo` derivado
correctamente (`010101` para el distrito de Chachapoyas, Amazonas); edición de empresa con
`distritoId: null` limpia también el `ubigeo`. 44 pruebas automatizadas pasando (4 nuevas en
`tests/geografia.test.ts`), typecheck/lint/build limpios en ambos paquetes.

## Facturación electrónica SUNAT vía OSE (FASE 28, 2026-09-15)

**Contrato del OSE, confirmado antes de escribir el cliente.** NubeFacT documenta dos productos
distintos: uno que arma el XML desde una "trama" JSON propia (no sirve, dejaría muerto el
`factura.builder.ts`/`firmador.ts` ya construidos) y **NubeFacT OSE** (`ose.nubefact.com`), que
recibe el XML **ya firmado**. Este último habla el mismo protocolo `billService` que usa SUNAT
para su propio SEE-SOL: SOAP + WS-Security (`UsernameToken`/`PasswordText`), el XML va
comprimido en `.zip` y en Base64 dentro de `sendBill`. Endpoints confirmados contra la
documentación pública: `https://ose.nubefact.com/ol-ti-itcpe/billService` (producción) y
`https://demo-ose.nubefact.com/ol-ti-itcpe/billService` (beta).

**Por qué un cliente SOAP a mano y no una librería.** El proyecto ya arma XML a mano en todo el
módulo de facturación (`xml.util.ts`: "un builder genérico no evita ningún error real"); el
mismo criterio aplica al sobre SOAP, que es fijo y pequeño. `jszip` ya era una dependencia sin
usar en el proyecto — quien empezó el módulo de facturación (FASE 14) ya la había anticipado
para justo este paso.

**Por qué la emisión es una acción explícita desde `/ventas`, no automática al crear la venta.**
El plan original consideraba un enganche "best-effort" dentro de `crearVenta`, con el mismo
criterio que ya usa `consultarTipoCambio` (no bloqueante, falla en silencio). Pero cada petición
corre dentro de **una única transacción de base de datos** (`tenant.middleware.ts`): encadenar
ahí una llamada de red a un OSE (hasta 30 s de por sí, más lo que tarde SUNAT detrás) dejaría la
respuesta de "venta creada" —y la conexión a la base— esperando al OSE, y una venta con el
comprobante fallido silenciosamente es peor que una venta sin comprobante y un botón visible
para emitirlo. Se decidió que emitir sea un paso aparte, disparado desde el detalle de la venta:
más simple, no arriesga la venta si el OSE está caído, y es la UX habitual de un POS (estado del
comprobante + reintentar, sin bloquear el cobro).

**Certificado y credenciales del OSE, cifrados en reposo, por empresa.**
`configuraciones_facturacion` guarda el `.pfx` y la clave del OSE como `bytea` cifrados
(`utils/cifrado.ts`, AES-256-GCM; ver `base-de-datos.md` para el detalle de columnas). Es la
primera vez que el proyecto cifra algo en la base en vez de solo hashearlo (como las
contraseñas de usuario, con `bcrypt`) — acá hace falta **recuperar** el original para firmar,
no solo compararlo. El certificado nunca toca el disco: `config/uploads.ts` gana un segundo
uploader (`uploaderCertificado`, `memoryStorage`) distinto del que ya existía para fotos de
producto (`diskStorage`, pensado para archivos públicos sin nada sensible).

**`activo` es un interruptor separado de tener certificado/credencial cargados.** Terminar de
configurar sin que una venta dispare un envío real a mitad de la carga de datos.

**Verificado a mano contra el OSE real, no solo con datos de prueba.** Se registró una empresa
de prueba, se le cargó un certificado autofirmado (`generarCertificadoPruebas`, empaquetado a
`.pfx` con `node-forge`) y credenciales de OSE inventadas, se creó una venta real y se llamó
`POST /api/facturacion/ventas/:id/emitir` contra el endpoint demo real de NubeFacT. La respuesta
fue un rechazo esperado (credenciales inexistentes / certificado no acreditado), pero confirmó
que **todo el circuito funciona de punta a punta contra el servicio real**: arma el XML, lo
firma, lo comprime, arma el sobre SOAP con WS-Security, lo envía, y parsea correctamente una
respuesta de error real del OSE. **Encontró y corrigió un bug real en el proceso**: el primer
intento guardó el `faultcode` genérico del sobre SOAP (ej. `soapenv:Server`, más largo que 10
caracteres) como si fuera el código de negocio de SUNAT, y reventó con un error 500 de "value
too long" contra la columna `codigo_respuesta varchar(10)`. Se corrigió para que solo el código
de negocio real (`<cod>`, corto y numérico) se guarde ahí, con una segunda capa de defensa
(truncar a 10 caracteres en el service) para que un OSE que responda distinto de lo esperado
nunca tumbe la petición completa.

**Explícitamente fuera de alcance de esta fase** (quedan documentadas para cuando el usuario las
pida): notas de crédito/débito, comunicación de baja, resumen diario de boletas, guía de
remisión electrónica, envío directo a SUNAT (solo vía OSE, por la decisión ya tomada) y
representación impresa en PDF del comprobante.

**Pendiente de acción real del usuario.** Dar de alta una cuenta con NubeFacT (real o de
pruebas) y cargar sus credenciales + un certificado digital (real, o uno de pruebas para el
ambiente beta) desde `/facturacion-electronica` — sin eso, ninguna empresa puede emitir un
comprobante que SUNAT realmente acepte. Es la misma limitación que ya se explicó al usuario
antes de empezar esta fase: el código está completo y verificado hasta donde se puede sin una
cuenta real.

## Bug real: digest de la firma calculado distinto al verificado (2026-09-18)

**Síntoma.** Con una cuenta de NubeFacT OSE real (credenciales válidas, no inventadas), el envío
llegó más lejos que en la verificación manual anterior y NubeFacT respondió `"El documento
electrónico ingresado ha sido alterado | signature validation status: true ref[0] validity
status: false"`: la firma en sí es válida (la clave privada corresponde al certificado), pero el
digest de la referencia no coincide con el documento recibido.

**Causa raíz, confirmada sin red ni NubeFacT de por medio.** `firmador.ts` declaraba la
referencia con un solo transform: `enveloped-signature`, sin canonicalización explícita después.
`xml-crypto` (`signed-xml.js`) trata ese caso de forma asimétrica entre firmar y verificar:
- **Al firmar** (`createReferences` → `getCanonXml`), si la lista de transforms no termina en un
  algoritmo de canonicalización, el resultado del transform `enveloped-signature` (un nodo DOM)
  se serializa con `Node.toString()` crudo — no es Canonical XML real.
- **Al verificar** (`loadReference`), si detecta que el último transform es
  `enveloped-signature`, **agrega automáticamente** `http://www.w3.org/TR/2001/REC-xml-c14n-20010315`
  a la lista antes de recalcular el digest.

Mismo documento, dos serializaciones distintas → el digest que se firma nunca coincide con el
que cualquier verificador conforme al estándar (`xml-crypto` mismo, y por lo visto también
NubeFacT/SUNAT) recalcula. Se reprodujo firmando un XML mínimo con `firmarXml` y
auto-verificándolo con `SignedXml.checkSignature` de la misma librería, sin tocar la red: fallaba
igual, confirmando que no es un problema de interoperabilidad con NubeFacT sino un bug propio.

**Corrección.** Agregar la canonicalización (`http://www.w3.org/TR/2001/REC-xml-c14n-20010315`)
como segundo transform explícito de la referencia en `firmador.ts`, después de
`enveloped-signature`. Con eso la auto-verificación pasa. Verificado con el mismo script de
reproducción, la suite de `facturacion.test.ts` (8/8) y `tsc --noEmit` de `src` y `tests`, todo en
verde.

**Por qué no se detectó en la verificación manual original de esta fase.** Aquella prueba usó
credenciales de OSE inventadas: NubeFacT rechazó por autenticación (WS-Security) antes de llegar
a validar la firma del XML en sí, así que el bug del digest nunca se ejerció de punta a punta.
"El circuito llega y vuelve" no es lo mismo que "el documento que llega es válido" — con
credenciales reales sí se llegó a esa validación y apareció el error real.
