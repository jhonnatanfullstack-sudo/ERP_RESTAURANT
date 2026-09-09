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
