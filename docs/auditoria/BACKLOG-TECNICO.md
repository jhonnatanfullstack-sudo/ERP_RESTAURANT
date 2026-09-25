# BACKLOG TÉCNICO — SISTEMA RESTAURANT

Fecha de auditoría: 2026-09-23
Auditor A: Claude Code
Auditor B: Codex
Estado: Hallazgos verificados mediante auditoría independiente + verificación cruzada.

---

## P0 — SEGURIDAD

### H01 — Cuenta semilla/proveedor

- **ID:** H01
- **Prioridad:** P0
- **Severidad:** CRÍTICO
- **Estado:** RESUELTO
- **Módulo afectado:** Base de datos / Autenticación / Plataforma
- **Archivos implicados (hallazgo original):**
  - `apps/backend/src/database/migrations/1788763124133-SeedRbacInicial.ts` (líneas 72-78)
  - `apps/backend/src/database/migrations/1789000400000-UsuarioProveedor.ts` (líneas 22-43)
  - `apps/backend/src/database/migrations/1789000500000-CorregirMarcaProveedor.ts` (líneas 26-34)
  - `apps/backend/src/modules/plataforma/plataforma.routes.ts` (línea 17)
- **Descripción (hallazgo original):** La migración semilla crea en toda instalación el usuario `admin@restaurant.local` con la contraseña conocida `CambiarInmediatamente123!` (hasheada con bcrypt, no en texto plano). Una migración posterior marca automáticamente como `es_proveedor = true` al usuario cuyo email coincide con `PROVEEDOR_EMAIL`, o —si no hay coincidencia— al usuario **más antiguo** de la base, que en toda instalación recién migrada es exactamente esa cuenta semilla.
- **Evidencia encontrada (hallazgo original):** Confirmado por lectura directa de `1789000400000-UsuarioProveedor.ts:36-43`, con el propio comentario del archivo (líneas 15-17) reconociendo el comportamiento de *fallback*. `plataforma.routes.ts:17` protege el panel `/api/plataforma` solo con `requireProveedor`, sin `requirePermission` adicional.
- **Impacto (hallazgo original):** Sin configurar `PROVEEDOR_EMAIL` antes del primer `migration:run`, cualquiera que conozca la contraseña semilla documentada en el propio código obtiene, además del acceso admin al restaurante demo, acceso al panel transversal `/plataforma` sobre **todas las empresas del SaaS** (uso, acciones sobre suscripciones, bypass de RLS).
- **Escenario reproducible (hallazgo original):** Desplegar el sistema en un entorno nuevo sin definir `PROVEEDOR_EMAIL` en el `.env` antes de ejecutar `migration:run` por primera vez → el usuario `admin@restaurant.local` queda marcado como proveedor → iniciar sesión con la contraseña semilla documentada → acceder a `/plataforma`.
- **Criterio de aceptación:** Una instalación nueva del sistema no puede quedar con la cuenta semilla (`admin@restaurant.local`/contraseña de ejemplo) marcada como proveedor de la plataforma sin una acción explícita y deliberada del operador, verificado con una prueba automatizada. **Cumplido — ver Resolución.**

#### Resolución

Implementación por etapas, con revisión independiente de Codex en cada ronda (R01-R13), certificada finalmente el 2026-09-23. Evidencia:

- **Proveedor implícito/inseguro eliminado:** `NeutralizarProveedorSemilla` (migración `1789013000000`) revierte `es_proveedor` de la cuenta semilla identificada por procedencia estructural en `personal` (no por email — sigue detectándola aunque el email se haya cambiado), en vez de por el *fallback* de `UsuarioProveedor`/`CorregirMarcaProveedor` (esas dos migraciones históricas no se modificaron).
- **Rotación obligatoria de contraseña:** columna `usuarios.debe_cambiar_password` (agregada por la misma migración); la cuenta semilla queda con esa bandera en `true` si su contraseña sigue siendo el placeholder público del repositorio, o solo se advierte (sin tocarla) si ya fue rotada — nunca se asume qué decisión tomó el operador.
- **Restricción centralizada mientras hay rotación pendiente:** `auth.middleware.ts` (`requireAuth`) bloquea cualquier ruta de negocio con `428 DEBE_CAMBIAR_PASSWORD` mientras `debeCambiarPassword = true`, dejando accesibles únicamente `/api/auth/cambiar-password`, `/api/auth/logout` y `/api/auth/me` (vía `req.originalUrl`, no `req.path`, para no depender de la profundidad de montaje del middleware — bug latente corregido en el mismo cambio).
- **Socket.IO valida contra la BD en cada conexión:** el handshake (`realtime/socket.ts`) consulta `activo`/`debeCambiarPassword` frescos desde la base en cada intento de conexión (nunca confía en el JWT), dentro de una función que nunca rechaza sin control (`usuarioPuedeConectar`, con `try/catch/finally` explícito sobre `connect`/`startTransaction`/`commit`/`rollback`/`release` — corrección R12 de un `unhandledRejection` real que existía en la primera versión).
- **CLI administrativo explícito:** `proveedor-bootstrap.service.ts` (`asignarProveedor`/`quitarProveedor`/`listarProveedores`) + `scripts/cli-proveedor.ts` (`pnpm proveedor:asignar/quitar/listar`) son el único mecanismo normal para otorgar el privilegio — nunca por HTTP, nunca por SQL directo, siempre con confirmación explícita.
- **Máximo un proveedor global:** `asignarProveedor` usa `pg_advisory_xact_lock` para serializar asignaciones concurrentes y rechaza (409) si ya existe un proveedor distinto.
- **Índice único parcial en BD (defensa en profundidad):** migración `UnicoProveedorGlobal` (`1789014000000`) crea `IDX_un_proveedor_global` (`UNIQUE ... WHERE es_proveedor = true`) — el invariante queda garantizado por Postgres, no solo por el código, incluso ante un `UPDATE` directo que se salte el servicio.
- **Preflight PRE-H01 para instalaciones antiguas inconsistentes:** `scripts/preflight-h01.ts` + `preflight-h01-core.ts` (`pnpm preflight:h01 verificar` / `resolver --mantener-id <uuid>`) — herramienta separada, exclusiva de esta recuperación excepcional, que NO importa la entidad `Usuario` ni `AppDataSource` (solo SQL directo sobre `id`/`email`/`es_proveedor`, columnas anteriores a H01), porque el modo transaccional real de TypeORM (`transaction: "all"`, confirmado contra el código fuente de `MigrationExecutor`, no fijado explícitamente en ningún `DataSource` del proyecto) revierte **toda** la migración pendiente —incluida la columna `debe_cambiar_password`— si `UnicoProveedorGlobal` falla por detectar más de un proveedor.
- **Selección inequívoca por UUID:** `resolverProveedorPreH01` identifica la cuenta a conservar exclusivamente por `usuarios.id`, nunca por email — `usuarios.email` no tiene una restricción que lo normalice (ver H01-R08 más abajo) y dos cuentas pueden diferir solo por mayúsculas/minúsculas. El email se muestra solo como ayuda visual. La verificación final antes de confirmar comprueba no solo `COUNT(es_proveedor=true) = 1` sino que ese único proveedor sea, por ID, exactamente el elegido.
- **R13-F (regresión de casing):** prueba dedicada con dos usuarios PRE-H01 (`Proveedor@dominio.com` / `proveedor@dominio.com`, distintos para Postgres) que confirma que `verificar` los distingue como cuentas separadas y que `resolver --mantener-id` selecciona sin ambigüedad, sin depender de ningún orden de lectura.
- **Migraciones H01:** `1789013000000-NeutralizarProveedorSemilla` y `1789014000000-UnicoProveedorGlobal`, ambas con `activarBypassRls` donde corresponde y sin modificar ninguna migración histórica.
- **Procedimiento de upgrade documentado:** `docs/despliegue.md` — instalación normal (0/1 proveedor) vs. instalación antigua con conflicto (preflight → resolución explícita por ID → `migration:run`), con la explicación explícita de por qué el procedimiento documentado antes ("migrar, si falla usar el CLI, volver a migrar") era inválido bajo `transaction: "all"`.
- **Validación final:** suite completa 188/188 PASS (26/26 archivos) · `typecheck` PASS · `lint` 0 errores (2 warnings preexistentes de frontend, no relacionados, sin cambios) · `build` PASS · `git diff --check` PASS · certificación independiente final de Codex aprobada (2026-09-23).

#### Diferido (fuera de alcance de H01, no bloqueante para este cierre)

- **R07 → H06:** las sesiones (refresh tokens) emitidas antes de un cambio de contraseña siguen siendo válidas después — mismo problema ya cubierto por H06 ("Cambio de contraseña no revoca sesiones"), que permanece PENDIENTE.
- **Revocación de sockets ya conectados → H08:** un socket conectado antes de que `debeCambiarPassword` pase a `true` no se desconecta retroactivamente; el nuevo handshake solo protege conexiones futuras.
- **R08 (normalización global de emails):** no fue necesario resolverlo para cerrar H01 — la operación privilegiada PRE-H01 (`resolver`) se rediseñó para usar `usuarios.id` precisamente para no depender de esa normalización, todavía pendiente a nivel de todo el sistema.
- **R09-R11 y observaciones residuales de la revisión de Codex:** clasificadas en su momento como no bloqueantes (mejoras de pruebas y de comentarios internos); no se abre una entrada de backlog separada por no representar un riesgo de seguridad pendiente.
- **Advertencia de `pg`** sobre `client.query()` concurrente (deprecada desde `pg@9`, visible en la salida de la suite de tests): ya registrada, no se intenta resolver como parte de H01.

### H02 — oseClave almacenada en auditoría

- **ID:** H02
- **Prioridad:** P0
- **Severidad:** ALTO
- **Estado:** RESUELTO
- **Módulo afectado:** Auditoría / Facturación electrónica
- **Archivos implicados (hallazgo original):**
  - `apps/backend/src/modules/auditoria/auditoria.middleware.ts` (líneas 12-22, lista `CAMPOS_SENSIBLES`; línea 87)
  - `apps/backend/src/modules/facturacion/facturacion.dto.ts` (línea 10, campo `oseClave`)
  - `apps/backend/src/modules/facturacion/facturacion.routes.ts` (líneas 21-26)
- **Descripción (hallazgo original):** La lista `CAMPOS_SENSIBLES` de redacción del middleware de auditoría compara por igualdad exacta (en minúsculas) y no incluye `oseclave`. El campo `oseClave` del DTO de configuración de facturación (credencial del proveedor OSE) no coincide con ninguno de los nombres de la lista.
- **Evidencia encontrada (hallazgo original):** `express.json()` parsea el body antes de que `auditoriaMiddleware` lo copie (`app.ts`, orden de middlewares); `redactar(req.body)` no aplica ninguna transformación a `oseClave` porque no está en `CAMPOS_SENSIBLES`. El cifrado AES-256-GCM de `utils/cifrado.ts` protege la tabla `configuraciones_facturacion`, pero eso ocurre en una capa posterior y distinta de la bitácora de auditoría.
- **Impacto (hallazgo original):** La contraseña/credencial del proveedor OSE (NubeFacT) queda registrada en texto plano en `registro_auditoria` cada vez que un administrador actualiza `PUT /api/facturacion/configuracion`, accesible a cualquiera con permiso de lectura de auditoría, acceso directo a la base o a un respaldo/dump.
- **Escenario reproducible (hallazgo original):** Un administrador con permiso `facturacion.configurar` llama `PUT /api/facturacion/configuracion` con `oseClave` en el body → la fila de auditoría resultante contiene `oseClave` en claro dentro de la columna `datos` (jsonb).
- **Solución conceptual (hallazgo original):** No implementada en esta tarea. Conceptualmente, agregar `oseclave` (y revisar nombres equivalentes) a `CAMPOS_SENSIBLES`, o redactar por patrón en vez de por igualdad exacta.
- **Pruebas necesarias (hallazgo original):** Prueba de integración que verifique que al llamar `PUT /api/facturacion/configuracion` con `oseClave`, la fila de auditoría resultante no contiene ese valor en claro.
- **Criterio de aceptación:** Ninguna fila de `registro_auditoria` contiene la credencial del OSE en texto plano, verificado con una prueba automatizada. **Cumplido — ver Resolución implementada.**

#### Resolución implementada

- **Denylist centralizada:** `apps/backend/src/modules/auditoria/campos-sensibles.ts` (nuevo) reúne `CAMPOS_SENSIBLES`, `REDACTADO`, `normalizarNombreCampo()` y `redactar()`, antes duplicados dentro de `auditoria.middleware.ts`. Se agregó `oseclave` a la lista.
- **Normalización:** `nombre.toLowerCase().replace(/[_-]/g, '')` — minúsculas más eliminación de `_` y `-`, idéntica en TypeScript y en la migración histórica. La comparación contra la denylist sigue siendo por **igualdad exacta** (nunca `includes`/`startsWith`/regex), para no redactar por error campos legítimos como `tokenExpiraEn` o `claveProducto`.
- **Redacción recursiva de peticiones nuevas:** `redactar()` sigue recorriendo objetos y arrays de forma recursiva; ahora compara cada clave ya normalizada.
- **Valor estándar:** se reutilizó `'[redactado]'`, el único formato ya usado en el proyecto — no se introdujo uno nuevo.
- **PFX/P12:** `contrasena` (contraseña del certificado subido en `POST /facturacion/configuracion/certificado`) queda documentada explícitamente en la denylist como protección también para ese campo, independiente del orden actual de middlewares (no se modificó ese orden).
- **Saneamiento histórico:** migración `apps/backend/src/database/migrations/1789015000000-SanearOseClaveAuditoriaHistorica.ts`. Usa una función PL/pgSQL recursiva (creada y eliminada dentro de la propia migración) que reconstruye objetos y arrays a cualquier profundidad, redactando únicamente el valor de las propiedades cuya clave normaliza a `oseclave`.
- **Alcance histórico:** limitado deliberadamente a `modulo = 'facturacion'` y a la clave normalizada `oseclave` — no se amplió a todo `CAMPOS_SENSIBLES` ni a otros módulos, por no existir evidencia de fuga equivalente (ver razonamiento en el comentario de la propia migración).
- **Preservación:** el `UPDATE` solo toca la columna `datos`; usuario, empresa, acción, módulo, método, ruta, estado HTTP y fecha quedan intactos, igual que cualquier propiedad no secreta dentro de `datos`.
- **RLS:** `activarBypassRls(queryRunner)` local a la transacción de la migración — no se desactivó RLS de forma global.
- **Idempotencia:** el `UPDATE` solo escribe filas donde el valor recalculado difiere del actual; una segunda ejecución no modifica nada.
- **`down()`:** no-op documentado — irreversible por seguridad, nunca restaura un secreto.

#### Evidencia de validación

- `auditoria-secretos.test.ts`: **12/12 PASS**
- `auditoria.test.ts`: **2/2 PASS**
- `facturacion.test.ts`: **8/8 PASS**
- Suite completa backend: **200/200 PASS (27/27 archivos)**
- typecheck backend: **PASS**
- lint: **0 errores**, 2 warnings preexistentes de frontend sin relación
- build backend: **PASS**
- `git diff --check`: **PASS**
- Codex: `CERTIFICACIÓN CODEX — H02 APROBADO PARA CIERRE`

`typecheck`/`build` de frontend siguen fallando exclusivamente por `apps/frontend/src/routes/AppRoutes.tsx:50` (`LoginPage` declarado sin usar) — confirmado como **preexistente / fuera de alcance de H02** (reproducido también en la rama base sin los cambios de H02). H02 no modificó ningún archivo de frontend.

#### Correcciones durante revisión independiente

- **H02-R01 — RESUELTO.** La primera versión de la migración solo saneaba el primer nivel de `datos`. Codex detectó que peticiones históricas rechazadas por `validateBody` podían contener `oseClave` anidado o dentro de arrays, porque `auditoriaMiddleware` captura el body antes de la validación. Se sustituyó por el saneamiento PL/pgSQL recursivo descrito arriba y se fortalecieron T09-T11 para cubrir objetos anidados, arrays, primitivos JSON y `NULL`.
- **H02-R02 — RESUELTO.** T12 podía dar un falso positivo por la escritura de auditoría asíncrona (ver nuevo hallazgo de auditoría fire-and-forget más abajo): comprobaba que la Empresa B no veía nada sin haber confirmado antes que la entrada de la Empresa A ya existía. Se corrigió la secuencia: primero se confirma (con espera acotada) que la entrada de A existe y está redactada, y solo después se verifica que B no puede verla.

### H04 — Autopedido público y exposición de PII

- **ID:** H04
- **Prioridad:** P0
- **Severidad:** ALTO
- **Estado:** RESUELTO
- **Módulo afectado:** Pedidos / Carta pública
- **Archivos implicados (hallazgo original):**
  - `apps/backend/src/modules/carta-publica/carta-publica.routes.ts` (líneas 79-88)
  - `apps/backend/src/modules/pedidos/pedido.service.ts` (líneas 182-244, función `crearPedidoPublico`)
  - `apps/backend/src/modules/pedidos/pedido.entity.ts`
  - `apps/backend/src/modules/clientes/cliente.entity.ts` (líneas 28-56)
  - `apps/backend/src/utils/api-response.ts` (líneas 3-5)
- **Descripción (hallazgo original):** El endpoint público `POST /:slug/pedidos` (autopedido, sin autenticación) busca cualquier pedido `abierto` en la mesa indicada sin filtrar por canal de origen (`canalOrigen`), y lo reutiliza si existe — incluso si ese pedido fue abierto por un mesero autenticado con un `cliente` asociado. La respuesta se serializa completa, sin mapper que oculte datos de contacto.
- **Evidencia encontrada (hallazgo original):** `pedido.service.ts:191-194`, `findOneBy({ mesa: {id}, estado: ABIERTO })` sin condición sobre `canalOrigen`; `RELACIONES` de la consulta incluye `cliente: true`; `sendSuccess` (`api-response.ts`) serializa el objeto tal cual sin filtrar campos.
- **Impacto (hallazgo original):** Cualquier persona con el enlace/QR de una mesa (UUID compartible sin expiración) puede recibir en la respuesta datos personales del cliente asociado al pedido existente (nombres/razón social, documento de identidad, teléfono, email, dirección) y ver/agregar líneas a un pedido ajeno, sin autenticarse ni estar físicamente presente.
- **Escenario reproducible (hallazgo original):** Un mesero abre un pedido de salón en la Mesa 5 con un cliente fidelizado asociado → un tercero con el enlace `/carta/:slug?mesa=<uuid>` llama `POST /api/publico/:slug/pedidos` con `canalOrigen: AUTOPEDIDO` y el mismo `mesaId` → recibe en la respuesta el pedido completo, incluyendo el objeto `cliente` con sus datos personales.
- **Solución conceptual (hallazgo original):** No implementada en esta tarea. Conceptualmente correspondería filtrar la reutilización de pedido por canal de origen y/o aplicar un mapper público que excluya datos de `cliente`/PII en la respuesta del autopedido.
- **Pruebas necesarias (hallazgo original):** Prueba de integración que confirme que el endpoint público de autopedido nunca devuelve datos de `cliente` (documento, teléfono, email, dirección) ni permite modificar un pedido abierto por otro canal de origen.
- **Criterio de aceptación:** El endpoint público de autopedido no expone PII de clientes en su respuesta y no permite modificar pedidos abiertos por meseros/otros comensales sin un mecanismo de verificación, con evidencia de prueba automatizada. **Cumplido — ver Resolución implementada.**

#### Resolución implementada

Dos controles independientes, ambos necesarios (uno no sustituye al otro):

- **Integridad — `crearPedidoPublico()` ya no reutiliza indiscriminadamente cualquier pedido abierto de la mesa.** Para `canalOrigen: AUTOPEDIDO` se listan **todos** los pedidos `ABIERTO` de la mesa (no el primero que devuelva `findOne`, para no depender de un orden arbitrario) y se distinguen cuatro casos de forma inequívoca:
  - **A.** Solo existe un `AUTOPEDIDO` abierto → se reutiliza ese pedido.
  - **B.** Existe cualquier pedido abierto de OTRO canal → se responde `409` antes de cualquier mutación (no se le agregan líneas, no se lee su `cliente`, no se lo toca).
  - **C.** No existe ningún pedido abierto → se crea un `AUTOPEDIDO` nuevo.
  - **D.** Coexisten un `AUTOPEDIDO` y un pedido de otro canal abiertos a la vez en la misma mesa (estado que la aplicación normal no debería alcanzar, pero que H12 todavía no impide a nivel de base de datos) → se responde `409` igual que en B, sin fusionar ni elegir arbitrariamente cuál es el válido, y sin modificar ninguno de los dos.
- **Confidencialidad — nuevo `apps/backend/src/modules/pedidos/pedido.mapper.ts` (`pedidoPublico()`).** Construye la respuesta pública propiedad por propiedad, con una **allowlist explícita** — nunca `{ ...pedido }`, nunca `Object.assign` de la entidad, nunca serializar completo y después `delete`. `cliente` y `clienteId` quedan excluidos **estructuralmente**: la función no los lee en ningún punto de su código, así que no depende de que `cliente` sea `null` para ser segura. `carta-publica.routes.ts` pasa la respuesta de `POST /:slug/pedidos` por este mapper para los tres canales públicos (`AUTOPEDIDO`, `DELIVERY`, `RECOJO`), que comparten el mismo handler.
- **Riesgo residual (H12, sin resolver aquí):** H04 no agregó índice único, lock, `SELECT FOR UPDATE`, advisory lock ni ninguna transacción nueva. La ausencia de una garantía a nivel de base de datos de "un solo pedido abierto por mesa" sigue siendo H12, íntegramente pendiente; H04 solo asegura que, si esa condición de carrera llegara a producir el estado inconsistente D descrito arriba, el endpoint público lo trata de forma segura (rechazo, sin fusión), sin depender de que H12 ya esté resuelto.

##### Contrato público resultante (`pedidoPublico()`)

```
id
estado
canalOrigen
mesa: { id, numero, salon } | null   ← `salon` es únicamente `pedido.mesa.salon.nombre` (string), NO la entidad Salon completa
detalles: [{ productoId, cantidad, precioUnitario, subtotal, notas }]
total
direccionEntrega
```

**Nunca se exponen:** `cliente`, `clienteId`, la entidad `Empresa`, ningún usuario interno, el objeto `Producto` completo (costos, stock, margen, proveedor) ni ninguna otra relación interna — la allowlist solo copia los campos escalares/planos listados arriba.

#### Evidencia de validación

- `carta-publica.test.ts` (H04/carta pública): **13/13 PASS**
- `pedidos-comandas.test.ts` (relacionado): **19/19 PASS**
- Ejecución conjunta verificada por Codex (2 archivos): **32/32 PASS**
- Suite backend completa: **205/205 PASS (27/27 archivos)**
- typecheck backend: **PASS**
- typecheck workspace: **FAIL únicamente** por `apps/frontend/src/routes/AppRoutes.tsx:50` (`LoginPage` declarado sin usar) — **preexistente, fuera de alcance de H04**
- lint: **PASS**, 0 errores, 2 warnings de frontend preexistentes sin relación
- build backend: **PASS**
- build frontend: **FAIL únicamente** por el mismo `LoginPage` preexistente
- `git diff --check`: **PASS**

##### Casos de seguridad verificados (T01-T11)

- **T01:** autopedido nuevo funciona (`201`).
- **T02:** autopedido + autopedido (mismo canal) reutiliza correctamente y acumula detalles.
- **T03:** SALON abierto + intento de AUTOPEDIDO → `409`; el pedido SALON permanece intacto (mismos `detalles`, mismo `total`).
- **T04:** SALON con `cliente` asociado (PII real) + intento de AUTOPEDIDO → `409` y la respuesta no contiene ningún dato del cliente.
- **T05:** el mapper recibe deliberadamente un objeto con `cliente`/PII cargado y no lo serializa — frontera de serialización probada, no una coincidencia del caso feliz.
- **T06:** DELIVERY sigue funcionando sin cambios.
- **T07:** RECOJO sigue funcionando sin cambios.
- **T08:** aislamiento RLS multiempresa permanece intacto.
- **T09:** autopedido sin `mesaId` → `400`.
- **T10:** el `409` es genérico — no filtra ids, PII ni el canal interno.
- **T11:** estado inconsistente (AUTOPEDIDO y SALON abiertos a la vez) → `409` y ninguno de los dos se modifica.

#### Certificación Codex

`CERTIFICACIÓN CODEX — H04 APROBADO PARA CIERRE`. Codex verificó de forma independiente: la vulnerabilidad original; la lógica A/B/C/D de conflicto de canal; el orden de las mutaciones (el rechazo ocurre antes de cualquier escritura); el aislamiento RLS; la allowlist del mapper, incluidos objetos anidados; el contrato consumido por el frontend; T01-T11; intentos de bypass; delivery/recojo; la ausencia de cambios en H01/H02; y la suite completa.

Durante la certificación, Codex señaló una observación de severidad BAJA sobre `detalle.notas` en el mapper público, que **no bloquea** el cierre de H04 — registrada como hallazgo independiente **H22** (ver P2 más abajo).

### H06 — Cambio de contraseña no revoca sesiones

- **ID:** H06
- **Prioridad:** P0
- **Severidad:** ALTO
- **Estado:** RESUELTO
- **Módulo afectado:** Autenticación
- **Archivos implicados (hallazgo original):**
  - `apps/backend/src/modules/auth/auth.service.ts` (función `cambiarPassword`)
  - `apps/backend/src/modules/auth/auth.controller.ts`
  - Tabla `refresh_tokens` (columna `revocado`)
- **Descripción (hallazgo original):** La función de cambio de contraseña valida la contraseña actual, hashea la nueva y guarda el usuario, pero no revoca ningún registro en `refresh_tokens` del mismo usuario. No existe blacklist de access tokens (diseño JWT stateless).
- **Evidencia encontrada (hallazgo original):** Búsqueda exhaustiva de `revocado = true` en `src/` solo la encuentra en `refrescarSesion` y `logout` de `auth.service.ts` — ninguna referencia desde `cambiarPassword`.
- **Impacto (hallazgo original):** Cambiar la contraseña —el control que un usuario usa típicamente ante sospecha de robo de sesión— no cierra ninguna sesión existente: cualquier refresh token vigente en otro dispositivo sigue pudiendo renovar la sesión indefinidamente, y cualquier access token ya emitido sigue funcionando hasta su expiración natural.
- **Escenario reproducible (hallazgo original):** Usuario detecta actividad sospechosa y cambia su contraseña desde un dispositivo → un refresh token robado/vigente en otro dispositivo sigue llamando `POST /api/auth/refrescar` con éxito después del cambio.
- **Solución conceptual (hallazgo original):** No implementada en esta tarea. Conceptualmente correspondería revocar todos los `refresh_tokens` activos del usuario al cambiar la contraseña.
- **Pruebas necesarias (hallazgo original):** Prueba de integración que verifique que, tras cambiar la contraseña, un refresh token emitido previamente ya no puede renovar la sesión.
- **Criterio de aceptación:** Cambiar la contraseña revoca todas las sesiones (refresh tokens) previas del usuario, verificado con prueba automatizada. **Cumplido — ver Resolución implementada.**

#### Resolución implementada

Un `UPDATE` simple sobre `refresh_tokens` sin más fue evaluado y **rechazado**: existe una carrera reproducible en la que un `refrescarSesion` concurrente con el cambio de contraseña podía dejar una sesión nueva sobreviviendo a la revocación. La solución final serializa ambas operaciones del mismo usuario con un lock de fila, además de la revocación:

- **`cambiarPassword` adquiere `pessimistic_write` (`SELECT ... FOR UPDATE`) sobre la fila de `Usuario`**, antes de validar la contraseña actual.
- **`refrescarSesion` adquiere el mismo lock, sobre la misma fila de `Usuario`**, con el mismo orden de adquisición que `cambiarPassword` (usuario primero, `refresh_tokens` después en ambas) — esto es lo que evita un deadlock cruzado entre ellas.
- **Ambas operaciones quedan así serializadas por usuario:** usuarios distintos bloquean filas distintas y no se contienen entre sí; solo dos operaciones del **mismo** usuario compiten por el mismo lock.
- **`refrescarSesion` consulta y revalida el refresh token DESPUÉS de adquirir el lock** — es la única lectura de `refresh_tokens` de toda la función, nunca una leída antes de esperar el lock.
- Esa revalidación comprueba explícitamente `revocado = false` **y** `expiraEn > ahora`.
- **El cambio de contraseña revoca TODOS los `refresh_tokens` activos del usuario** (`UPDATE ... WHERE usuario_id = :id AND revocado = false`), sin excluir la sesión desde la que se hizo el cambio — el criterio de aceptación exige revocar todas, sin excepción.
- Todo el lock, la validación, el hash nuevo y la revocación ocurren **dentro de la misma transacción por petición** ya existente (`tenant.middleware.ts`); no se abrió ninguna transacción adicional.
- **No se agregó Redis. No se agregó `tokenVersion`. No se agregó ninguna migración** — el mecanismo de revocación ya existía (`refresh_tokens.revocado`); solo hacía falta invocarlo con la serialización correcta.

**Los dos órdenes de concurrencia posibles:**

- **A. El refresh gana el lock primero:** adquiere el lock de `Usuario` → revalida el token (todavía válido) → rota (revoca la fila usada, crea el reemplazo) → confirma (`commit`), liberando el lock → **recién entonces** `cambiarPassword` obtiene el lock → cambia la contraseña → ejecuta el `UPDATE` masivo de revocación, que en ese momento ya ve confirmada la fila nueva que el refresh acababa de crear, y **también la revoca**.
- **B. El cambio de contraseña gana el lock primero:** adquiere el lock de `Usuario` → cambia la contraseña → revoca todos los `refresh_tokens` → confirma (`commit`), liberando el lock → **recién entonces** el refresh obtiene el lock → reconsulta el token → lo observa `revocado = true` (ya confirmado) → `401`.

En ambos órdenes, ninguna sesión previa al cambio de contraseña sobrevive.

#### Limitación residual: access tokens ya emitidos

H06 revoca **refresh tokens**. Los **access tokens** ya emitidos son stateless (JWT) y continúan siendo válidos hasta su expiración natural — configuración actual por defecto: ~15 minutos (`JWT_ACCESS_EXPIRES_IN`). Esta es una limitación residual conocida y **no bloquea el cierre de H06**, porque el hallazgo original (descripción, impacto, escenario y criterio de aceptación) se centraba explícitamente en la revocación de `refresh_tokens`, no en la invalidación inmediata de access tokens. No se abre un hallazgo nuevo sobre esto por no existir uno equivalente ya en el backlog y por tratarse de una característica de diseño (JWT stateless) documentada, no de un defecto.

#### Evidencia de validación

- `auth-sesiones.test.ts`: **12/12 PASS**
- H06/H01/H02 dirigidos (`auth-sesiones.test.ts`, `auth.test.ts`, `h01-proveedor-semilla.test.ts`, `auditoria-secretos.test.ts` — 4 archivos): **56/56 PASS**
- Suite backend completa: **217/217 PASS (28/28 archivos)**
- typecheck backend: **PASS**
- typecheck workspace: **FAIL únicamente** por `apps/frontend/src/routes/AppRoutes.tsx:50` (`LoginPage` sin usar) — **preexistente, fuera de alcance de H06**
- lint: **PASS**, 0 errores, 2 warnings de frontend preexistentes
- build backend: **PASS**
- build frontend: **FAIL únicamente** por el mismo `LoginPage` preexistente
- `git diff --check`: **PASS**
- PostgreSQL real en toda la suite, incluido **T11** (concurrencia con transacciones y locks reales, sin mocks)

**T01-T12** (resumen — el detalle completo vive en el propio archivo de test): T01-T03 y T06-T09 cubren el ciclo básico (login/refresh/rotación/logout/tokens inválidos/aislamiento), antes sin ninguna cobertura. **T04** reproduce la vulnerabilidad original (refresh previo al cambio de contraseña queda rechazado). **T05** confirma que se revocan **múltiples** sesiones del mismo usuario, no solo una. **T10** confirma la interacción correcta con H01 (`debeCambiarPassword`). **T11** ejercita la **concurrencia real** (ambos órdenes A y B, con transacciones controladas manualmente y locks genuinos de Postgres, sin `sleep` como sincronización). **T12** es la regresión de H02 (la auditoría del cambio de contraseña exitoso sigue redactando `passwordActual`/`passwordNuevo`).

#### Certificación Codex

`CERTIFICACIÓN CODEX — H06 APROBADO PARA CIERRE`. Codex verificó de forma independiente: la vulnerabilidad original; el modelo de transacción por petición; los locks agregados y su orden de adquisición; la revalidación del refresh posterior al lock; la revocación total; ambos órdenes de la carrera (A y B); T01-T12; la no interferencia con H01, H02 y H04; la ausencia de deadlocks; la limitación residual de los access tokens; el estado de H07; y la suite completa.

Durante la revisión, Codex señaló tres observaciones adicionales, ninguna bloqueante para el cierre de H06:

- **H06-R01** (severidad BAJA) — registrada como hallazgo independiente **H23** (ver P2, sección de Autenticación).
- **H06-R02** (severidad BAJA) — registrada como hallazgo independiente **H24** (ver P2, sección de Autenticación).
- **H06-R03** (informativo, calidad de prueba, no vulnerabilidad de producción) — documentada abajo, sin abrir un hallazgo nuevo.

##### Observación de calidad de prueba (H06-R03)

`T11` detecta la espera por el lock sondeando `pg_stat_activity` (`wait_event_type = 'Lock'` + texto de la consulta), pero no correlaciona un PID/conexión concreta con la operación bajo prueba. En la suite actual esto es suficiente: los archivos de test corren en serie (`fileParallelism: false`), la base es de uso exclusivo de la suite, y la operación que se espera bloquear es creada expresamente por el propio test — sin el lock productivo esperado, el sondeo simplemente expira y T11 falla (no da un falso positivo). Si en el futuro la suite pasara a ejecutarse contra una base compartida o con verdadera concurrencia entre archivos de test, convendría endurecer el sondeo correlacionando el PID/conexión exacta de la petición bloqueada. No se trata de una vulnerabilidad de producción, solo de una precisión posible del arnés de pruebas.

---

## P1 — INTEGRIDAD DEL NÚCLEO

### H09 — Commit fallido puede devolver respuesta exitosa

- **ID:** H09
- **Prioridad:** P1
- **Severidad:** ALTO
- **Estado:** RESUELTO
- **Módulo afectado:** Infraestructura transaccional (transversal a todo el backend)
- **Archivos implicados (hallazgo original):**
  - `apps/backend/src/middlewares/tenant.middleware.ts` (líneas 63-106)
- **Descripción (hallazgo original):** La función `cerrar()` que confirma o revierte la transacción por petición atrapa cualquier error de `commitTransaction()` únicamente con `logger.error(...)`, sin relanzarlo ni alterar la respuesta. El `res.end` interceptado siempre llama a la función original de envío tras `cerrar()`, sin importar si el commit tuvo éxito.
- **Evidencia encontrada (hallazgo original):** `tenant.middleware.ts:77-78` (`catch` que solo registra el fallo) y `tenant.middleware.ts:101-106` (el `.then()` del `res.end` interceptado se ejecuta siempre, incluso si `cerrar()` no logró confirmar). Verificado independientemente por ambos auditores con conclusión idéntica.
- **Impacto (hallazgo original):** Si `commitTransaction()` falla (p. ej. por un corte de conexión con Postgres en el instante del commit), el cliente recibe una respuesta 200/201 de éxito con un body que describe una operación como completada, mientras que en la base de datos esa operación no existe en absoluto (un COMMIT de Postgres es atómico: no hay persistencia parcial, sino "éxito fantasma").
- **Escenario reproducible (hallazgo original):** Provocar un fallo transitorio de conexión a Postgres exactamente durante el `COMMIT` de una petición de escritura (ej. crear una venta) y observar que el cliente recibe 200 pese a que la fila no queda en la base.
- **Solución conceptual (hallazgo original):** No implementada en esta tarea. Conceptualmente correspondería que, si el commit falla tras haberse preparado una respuesta de éxito, la respuesta enviada se sustituya por un error (5xx) antes de llamar a la función original de envío.
- **Pruebas necesarias (hallazgo original):** Prueba que simule un fallo de `commitTransaction()` (mock/inyección de fallo) y verifique que la respuesta HTTP resultante refleja el error, no el éxito original del controlador.
- **Criterio de aceptación:** Ante un fallo de `commitTransaction()`, el cliente nunca recibe una respuesta de éxito para esa petición, verificado con prueba automatizada. **Cumplido — ver Resolución implementada.**

#### Resolución implementada

Único archivo de producción tocado: `apps/backend/src/middlewares/tenant.middleware.ts`. Dos rondas de revisión independiente de Codex — la primera detectó tres bloqueantes sobre la implementación inicial (ver "Correcciones durante revisión independiente" más abajo), la segunda certificó el cierre.

- **Causa raíz original:** `cerrar()` atrapaba el error de `commitTransaction()` solo con `logger.error(...)` sin relanzarlo, y el `.then()` del `res.end` interceptado llamaba siempre a la función original de envío (`enviarOriginal(...args)`) con el body de éxito que el controlador ya había preparado, sin importar si el commit realmente se confirmó.
- **Máquina de estados de cierre — `ABIERTO → CERRANDO → CERRADO`.** Reemplaza el booleano único `cerrada` de la primera versión (que confundía "ya arrancó un cierre" con "ya es seguro enviar bytes" — ver Bloqueante 1 más abajo). `estado` gobierna exclusivamente si corresponde arrancar (o reutilizar) el commit/rollback real; una segunda llamada mientras `estado !== 'ABIERTO'` nunca abre un segundo commit/rollback.
- **Respuesta exitosa retenida hasta confirmar el commit.** El body de éxito armado por el controlador (`args` de `res.end`) no se envía de inmediato: `interceptada` espera a que `cerrar(...)` resuelva antes de decidir qué mandar. Esto es seguro porque, hasta ese momento, `res.headersSent` sigue en `false` (`res.status`/`res.set`/`res.json` no tocan el socket, solo lo hace esta función) — verificado leyendo el código fuente de Express instalado.
- **Sustitución por 500 cuando el commit falla.** Si la respuesta iba a ser de éxito (`res.statusCode < 400`) pero `cerrar(...)` resuelve con `confirmada = false`, el body original se descarta por completo y se envía `500 { success:false, message:'Error interno del servidor' }` — mismo contrato que usa `error-handler.middleware.ts`, sin exponer nunca el detalle interno de Postgres/TypeORM.
- **Limpieza de headers del éxito descartado (`limpiarHeadersDeExito`, nueva función).** Antes de sustituir el body, se eliminan `ETag`, `Location`, `Content-Disposition`, `Last-Modified` y `Set-Cookie` — headers ligados al payload de éxito abortado que Express no recalcula por sí solo (`ETag` solo se regenera si el header no existe todavía; `Set-Cookie` se elimina con `removeHeader`, no con `clearCookie`, porque este último *agrega* al array en vez de reemplazarlo). `Content-Type`/`Content-Length` no necesitan limpieza explícita: `res.send()` los recalcula siempre. Los headers transversales (`x-request-id`, los de `helmet()`, los de `cors()`) no se tocan.
- **Protección contra una segunda llamada a `res.end()` mientras el estado es `CERRANDO`.** Una señal separada, `autorizadoParaEnviar`, de un solo uso, es la única que habilita el envío real (`enviarOriginal`); una segunda llamada mientras el cierre está en curso no envía nada por su cuenta y no interfiere con la primera.
- **Manejo final de Promise / sin `unhandledRejection`.** La cadena `cerrar(...).then(...)` tiene un `.catch(...)` explícito: si el envío posterior al cierre falla (headers aún no enviados), intenta una respuesta 500 de emergencia envuelta en su propio try/catch; si los headers ya salieron, solo registra el error, sin intentar un segundo body.
- **Rollback defensivo tras un commit rechazado.** Si `commitTransaction()` falla y `queryRunner.isTransactionActive` sigue activo, se intenta un `rollbackTransaction()` de recuperación antes de liberar la conexión — para no devolver al pool una conexión con una transacción abortada sin resetear. Un fallo de ese rollback se registra aparte y nunca se afirma como una reversión confirmada.
- **Semántica preservada: `commit exitoso + release fallido = operación durable`.** Un fallo de `release()` después de un commit ya confirmado nunca convierte la respuesta en `500` — la operación ya es durable en Postgres independientemente de si la conexión se devolvió correctamente al pool de la aplicación.
- **RLS/multiempresa:** sin cambios. `tenantRepository`, `empresaId`, `AsyncLocalStorage` y las políticas RLS no fueron tocados; verificado con la suite de aislamiento y con pruebas que ejercitan dos empresas distintas tras un fallo de commit.

##### Limitación conocida (no bloquea el cierre, no es un hallazgo nuevo)

PostgreSQL puede responder al `COMMIT` de una transacción previamente abortada por una consulta anterior como si fuera un `ROLLBACK`, **sin lanzar** — y TypeORM no inspecciona el "command tag" de esa respuesta, así que puede interpretarlo como una resolución exitosa. Verificado empíricamente contra Postgres real durante esta implementación (una consulta inválida dentro de la transacción, seguida de `COMMIT`, resuelve en silencio como `ROLLBACK`). En ese escenario específico `commitTransaction()` ni siquiera llega a lanzar, así que el rollback defensivo descrito arriba no se activa. No existe ninguna solución mínima y pública de TypeORM para este caso concreto; no fue introducida por H09 y queda fuera de su alcance.

#### Correcciones durante revisión independiente

Codex certificó `H09 REQUIERE CORRECCIONES` sobre la primera implementación, con tres bloqueantes — los tres corregidos antes de la certificación final:

- **Bloqueante 1 (estado de cierre incorrecto):** el booleano único `cerrada` permitía que una segunda llamada a `res.end()`, mientras el commit de la primera todavía estaba pendiente, tomara el atajo de "ya está cerrada" y enviara bytes sin esperar el resultado real del commit. Resuelto con la máquina de estados `ABIERTO/CERRANDO/CERRADO` más la señal separada `autorizadoParaEnviar`, descritas arriba.
- **Bloqueante 2 (headers heredados del éxito):** la primera versión no limpiaba ningún header antes de sustituir el body por el error — un `ETag`/`Set-Cookie` de la respuesta de éxito abortada podía sobrevivir a la respuesta de error. Resuelto con `limpiarHeadersDeExito`.
- **Bloqueante 3 (Promise sin manejador final):** el `.then()` de `cerrar(...).then(...)` no tenía ningún `.catch()` — un fallo en el envío posterior al cierre quedaba como una Promise rechazada sin manejar y, en la práctica, dejaba la conexión colgada sin ninguna respuesta. Resuelto con el `.catch()` explícito descrito arriba.

#### Evidencia de validación

- **RED→GREEN:** revirtiendo temporalmente el archivo del fix a HEAD (`git stash`, sin tocar el commit del repositorio), el test principal (T02) reproducía el "éxito fantasma" exacto del hallazgo original (`201` con la fila ausente); con el fix, `500` y fila ausente. Para los tres bloqueantes de Codex se repitió el mismo patrón, reconstruyendo temporalmente la versión intermedia que Codex revisó: `T02b`/`T02c` (Bloqueante 2) mostraban el `Location`/`Set-Cookie` de éxito sobreviviendo a la respuesta de error; `T08b` (Bloqueante 1) terminaba en `Error: aborted` (conexión corrupta por doble envío); la prueba de `unhandledRejection` (Bloqueante 3) agotaba el timeout de 30s con el cliente sin recibir ninguna respuesta.
- **Tests específicos H09:** `apps/backend/tests/tenant-middleware-commit.test.ts` — **13/13 PASS** (T01, T02, T02b, T02c, T03, T04, T05, T06, T07, T08a, T08b, sección 6/unhandledRejection, T09).
- Suite backend completa: **235/235 PASS (29/29 archivos)**.
- typecheck backend: **PASS**.
- typecheck workspace: **FAIL únicamente** por `apps/frontend/src/routes/AppRoutes.tsx(50,1)` (`LoginPage` sin usar) — **preexistente, fuera de alcance de H09**.
- lint: **PASS**, 0 errores, 2 warnings de frontend preexistentes sin relación.
- build backend: **PASS**.
- build frontend: **FAIL únicamente** por el mismo `LoginPage` preexistente.
- `git diff --check`: **PASS**.

#### Certificación Codex

`CERTIFICACIÓN CODEX — H09 APROBADO PARA CIERRE` (segunda revisión, tras corregir los tres bloqueantes de la primera). No se afirma que H09 resuelva la atomicidad entre PostgreSQL y el envío al OSE — ese problema permanece íntegramente en **H13**.

### H11 — Corrupción de stock al editar compras repetidamente

- **ID:** H11
- **Prioridad:** P1
- **Severidad:** ALTO
- **Estado:** PENDIENTE
- **Módulo afectado:** Inventario / Compras
- **Archivos implicados:**
  - `apps/backend/src/modules/inventario/existencia.service.ts` (función `anularEntradasCompra`, líneas 390-414)
  - `apps/backend/src/modules/compras/compra.service.ts` (función `actualizarCompra`, líneas 258-299)
- **Descripción:** `anularEntradasCompra` reversa **todos** los movimientos de tipo `COMPRA` vinculados al `compra.id`, sin excluir los que ya fueron reversados en una edición anterior. Al editar una compra por segunda vez (o más), la función vuelve a reversar entradas que ya estaban correctamente neutralizadas por la edición previa.
- **Evidencia encontrada:** Traza matemática verificada directamente sobre el código para la secuencia 10→12→15: tras la primera edición el stock neto es correcto (+12); tras la segunda edición, `anularEntradasCompra` encuentra y reversa **ambas** entradas históricas (`COMPRA +10` de la creación y `COMPRA +12` de la primera edición), dejando un neto final de **+5** en vez de +15 — una corrupción de -10 exactamente igual a la cantidad original, reversada por segunda vez. El error se compone con cada edición adicional (no es un desajuste fijo).
- **Impacto:** El kardex de inventario (`existencias`) queda corrompido de forma silenciosa y determinística tras la segunda edición de cualquier compra, afectando stock, costeo y reportes derivados. No requiere ningún actor malicioso: se dispara con un flujo de uso normal y explícitamente soportado (editar una compra para corregir un dato).
- **Escenario reproducible:** Crear una compra con cantidad 10 → editarla a 12 → editarla nuevamente a 15 → consultar el stock resultante del ítem: es +5, no +15.
- **Solución conceptual:** No implementada en esta tarea. Conceptualmente correspondería que `anularEntradasCompra` excluya los movimientos `COMPRA` que ya tengan una reversa `ANULACION_COMPRA` asociada, o que el flujo de edición identifique y reverse únicamente el conjunto vigente (no histórico) de entradas.
- **Pruebas necesarias:** Prueba de integración que reproduzca la secuencia de tres ediciones sucesivas (10→12→15) y verifique que el stock final resultante es +15.
- **Criterio de aceptación:** Editar una compra múltiples veces siempre deja el stock igual a la cantidad de la versión más reciente, sin importar cuántas ediciones haya habido, verificado con prueba automatizada que cubra al menos 3 ediciones sucesivas.

### H18 — Doble conteo de efectivo en caja

- **ID:** H18
- **Prioridad:** P1
- **Severidad:** ALTO
- **Estado:** PENDIENTE
- **Módulo afectado:** Caja / Ventas / Cobranzas
- **Archivos implicados:**
  - `apps/backend/src/modules/caja/caja.service.ts` (líneas 63-121)
  - `apps/backend/src/modules/ventas/venta.service.ts` (líneas 148-163, `resolverMedioPago`)
  - `apps/backend/src/modules/ventas/venta.dto.ts` (líneas 11-44)
  - `apps/backend/src/modules/cobranzas/cobranza.service.ts` (líneas 206-287)
- **Descripción:** Ninguna capa (DTO, service, entidad, constraint de BD) impide crear una venta con `formaPago: 'credito'` y `medioPagoId` apuntando a "efectivo". El cálculo de efectivo del turno (`calcularVentasEfectivo`) filtra únicamente por `medioPago = efectivo`, sin excluir `formaPago = credito`, y por separado se suma también el cobro posterior de esa cuota en `cobranzas`.
- **Evidencia encontrada:** `caja.service.ts:63-79` — el `where` de la consulta de ventas en efectivo no incluye `formaPago: CONTADO`. `venta.service.ts:148-163` — la validación de "medio de pago obligatorio" solo se dispara cuando `formaPago === CONTADO` y falta el medio; no hay ningún bloqueo inverso. El frontend (`Ventas.tsx`) no limpia el campo de medio de pago al cambiar la forma de pago a Crédito.
- **Impacto:** Una venta a crédito registrada con medio de pago "efectivo" (por descuido de UI, sin necesidad de intención maliciosa) se cuenta como efectivo del turno en el momento de la emisión, y su cobro posterior se vuelve a sumar cuando se registra en `cobranzas` — el `montoEsperado` del arqueo queda inflado, pudiendo enmascarar un faltante real o permitir un egreso superior al efectivo físicamente disponible en el cajón.
- **Escenario reproducible:** Crear una venta con `formaPago: credito` y `medioPagoId` = efectivo → cerrar caja en ese turno: el monto esperado incluye esa venta como efectivo entrante → registrar el cobro de la cuota en efectivo vía `cobranzas`: se contabiliza una segunda vez en el siguiente cierre de caja que abarque esa fecha.
- **Solución conceptual:** No implementada en esta tarea. Conceptualmente correspondería impedir la combinación `formaPago: credito` + `medioPago: efectivo` en la creación de la venta, y/o excluir explícitamente `formaPago = CREDITO` del cálculo de ventas en efectivo del arqueo.
- **Pruebas necesarias:** Prueba de integración que cree una venta a crédito con medio de pago efectivo, registre su cobro, y verifique que el efectivo esperado del arqueo no cuenta el monto dos veces.
- **Criterio de aceptación:** El cálculo de efectivo esperado del cierre de caja nunca cuenta el mismo dinero dos veces entre una venta a crédito y el cobro de su cuota, verificado con prueba automatizada.

### H20 — Reparto duplicable de propinas

- **ID:** H20
- **Prioridad:** P1
- **Severidad:** ALTO
- **Estado:** PENDIENTE
- **Módulo afectado:** Propinas
- **Archivos implicados:**
  - `apps/backend/src/modules/propinas/reparto-propina.service.ts` (líneas 34-39, 136-182)
  - `apps/backend/src/modules/propinas/reparto-propina.entity.ts`
  - `apps/backend/src/database/migrations/1789008000000-RepartoPropinas.ts`
- **Descripción:** `crearReparto` calcula el total de propinas del período consultando `ventas.propina` por rango de fecha, sin verificar en ningún momento si ya existe un reparto previo sobre ese mismo rango o uno que se superponga. No hay columna de vínculo (`reparto_id`) en `Venta` ni constraint de rango en la migración.
- **Evidencia encontrada:** `reparto-propina.service.ts:34-39` (cálculo del total, sin exclusión de propinas ya repartidas) y líneas 136-182 (`crearReparto`, sin consulta previa a `repartoPropinaRepository`). La migración `1789008000000-RepartoPropinas.ts` no define ningún `EXCLUDE USING gist` ni índice único sobre rangos de fecha.
- **Impacto:** Ejecutar el reparto de propinas dos veces sobre fechas iguales o superpuestas duplica el monto entregado al personal, sin ninguna alerta del sistema — pérdida contable directa y real para el restaurante.
- **Escenario reproducible:** Ejecutar `POST /propinas/repartos` con un rango de fechas → ejecutar el mismo endpoint nuevamente con el mismo rango (o uno superpuesto) → se generan dos repartos independientes por el mismo dinero.
- **Solución conceptual:** No implementada en esta tarea. Conceptualmente correspondería vincular cada venta/propina repartida a su reparto (o registrar el rango ya cubierto) e impedir la creación de un reparto nuevo sobre fechas ya cubiertas o superpuestas.
- **Pruebas necesarias:** Prueba de integración que ejecute dos repartos sobre el mismo rango de fechas y verifique que el segundo es rechazado o no duplica el monto entregado.
- **Criterio de aceptación:** No es posible repartir dos veces las propinas del mismo período (o de períodos superpuestos), verificado con prueba automatizada.

### H21 — Auditoría fire-and-forget puede perder registros

- **ID:** H21
- **Prioridad:** P1
- **Severidad:** MEDIO
- **Estado:** PENDIENTE
- **Módulo afectado:** Auditoría / Infraestructura
- **Archivos implicados:**
  - `apps/backend/src/modules/auditoria/auditoria.middleware.ts` (`res.on('finish')`, `void registrarAuditoria(...)`)
  - `apps/backend/src/database/tenant-context.ts` (`ejecutarFueraDeLaPeticion`)
- **Descripción:** La escritura de la bitácora de auditoría se dispara de forma asíncrona ("fire and forget") después de finalizar la respuesta HTTP (`res.on('finish')`), en una conexión propia y sin que la petición del cliente espere a que esa escritura termine. La operación de negocio puede haber respondido exitosamente al cliente mientras la persistencia de su entrada de auditoría todavía está en curso.
- **Evidencia encontrada:** Detectado por Codex durante la revisión independiente de H02. `auditoriaMiddleware` llama `void registrarAuditoria(...)` sin `await` dentro del callback de `finish`; `ejecutarFueraDeLaPeticion` abre una conexión y transacción propias para esa escritura, ya desacopladas de la petición original. Durante el desarrollo de las pruebas de H02 se reprodujo una carrera real de esta naturaleza bajo la carga de la suite completa (un `GET /api/auditoria` disparado inmediatamente después de la acción auditada podía no encontrar todavía la entrada); se necesitó un helper de espera acotada (`esperarEntradaAuditoria`, en `apps/backend/tests/auditoria-secretos.test.ts`) para sincronizar esos tests de forma determinista.
- **Impacto:** Existe una ventana de tiempo, entre que la respuesta ya fue enviada al cliente y la escritura de auditoría todavía no se confirmó en la base, en la que una caída del proceso, un corte de conexión con la base o una terminación abrupta del servidor puede hacer que el registro de auditoría de una operación ya aceptada no llegue a persistirse nunca. No se afirma que esto ocurra de forma habitual en operación normal — es una ventana de pérdida bajo condiciones específicas de fallo, no una pérdida sistemática observada en producción.
- **Escenario reproducible:** Provocar la terminación del proceso (o un fallo de conexión a Postgres) exactamente en el intervalo entre `res.on('finish')` y la confirmación de la transacción abierta por `ejecutarFueraDeLaPeticion`, y observar que la operación de negocio ya respondida al cliente no tiene ninguna entrada correspondiente en `registros_auditoria`.
- **Solución conceptual:** No implementada en esta tarea. Conceptualmente correspondería evaluar una estrategia de persistencia más durable que no comprometa la latencia ni la respuesta de la operación de negocio — por ejemplo, una cola/outbox, un mecanismo de reintento con confirmación, u otro diseño equivalente. No se elige todavía una arquitectura definitiva.
- **Pruebas necesarias:** Prueba que confirme que la auditoría de una operación queda eventualmente persistida; prueba del comportamiento ante un error de persistencia; prueba del comportamiento durante un shutdown del proceso; y, si se introducen reintentos, prueba de que no se generan registros duplicados.
- **Criterio de aceptación:** Una operación que requiere auditoría no puede perder silenciosamente su registro después de haber sido aceptada, dentro del modelo de durabilidad que se defina para el sistema.

---

## P1 — FACTURACIÓN ELECTRÓNICA

### H13 — Envío al OSE antes del commit local

- **ID:** H13
- **Prioridad:** P1
- **Severidad:** ALTO
- **Estado:** PENDIENTE
- **Módulo afectado:** Facturación electrónica
- **Archivos implicados:**
  - `apps/backend/src/modules/facturacion/facturacion.service.ts` (líneas 130-231)
  - `apps/backend/src/middlewares/tenant.middleware.ts`
  - `apps/backend/src/database/tenant-repository.ts` (líneas 49-76)
- **Descripción:** La emisión de comprobantes al OSE (llamada de red de hasta 30s) ocurre dentro de la misma transacción por petición que registra el resultado en `comprobantes_electronicos`; el commit de esa transacción se confirma solo al final de toda la petición, después de la respuesta al OSE.
- **Evidencia encontrada:** `facturacion.service.ts` guarda el comprobante en `PENDIENTE` sin commit, llama al proveedor OSE, y guarda el resultado (`ACEPTADO`/`RECHAZADO`/`OBSERVADO`) todavía dentro de la misma transacción abierta por `tenant.middleware.ts`. `tenantRepository()` resuelve siempre el manager de esa transacción de petición.
- **Impacto:** Si el OSE acepta el comprobante y el commit posterior de Postgres falla, el sistema queda con un documento fiscal realmente aceptado por SUNAT/OSE (con CDR firmado) pero sin ningún registro local (ni siquiera en `PENDIENTE`, también revertido). No existe outbox ni job de reconciliación; la recuperación es manual, y el correlativo ya fue consumido, con riesgo de reintento con el mismo número.
- **Escenario reproducible:** Simular una aceptación exitosa del OSE seguida de un fallo de `commitTransaction()` en la misma petición de emisión, y verificar que no queda ningún registro local del comprobante pese a la aceptación real.
- **Solución conceptual:** No implementada en esta tarea. Conceptualmente correspondería separar la llamada de red al OSE del alcance de la transacción de base de datos, o introducir un mecanismo de reconciliación que detecte comprobantes aceptados por el OSE sin registro local.
- **Pruebas necesarias:** Prueba que simule un fallo de commit posterior a una respuesta de aceptación del OSE (mockeado) y verifique el estado resultante del sistema.
- **Criterio de aceptación:** Un comprobante aceptado por el OSE nunca queda sin ningún rastro local recuperable, verificado con prueba automatizada o mecanismo de reconciliación documentado.

### H14 — Venta anulada puede facturarse

- **ID:** H14
- **Prioridad:** P1
- **Severidad:** ALTO
- **Estado:** RESUELTO
- **Módulo afectado:** Facturación electrónica / Ventas
- **Archivos implicados (hallazgo original):**
  - `apps/backend/src/modules/facturacion/facturacion.service.ts` (función `emitirComprobante`, líneas 179-231)
  - `apps/backend/src/modules/ventas/venta.service.ts` (función `anularVenta`, líneas 515-551)
- **Descripción (hallazgo original):** `emitirComprobante()` valida que la venta exista y que no tenga ya un comprobante en un estado distinto de `ERROR_ENVIO`, pero nunca lee ni compara `venta.estado`. Por su parte, `anularVenta()` permite anular una venta que no tiene comprobante emitido (o que tiene uno en `ERROR_ENVIO`/`RECHAZADO`/`PENDIENTE`).
- **Evidencia encontrada (hallazgo original):** Confirmado por lectura directa de ambas funciones: ninguna de las dos impide, en conjunto, que una venta ya anulada sea posteriormente facturada.
- **Impacto (hallazgo original):** Se puede generar y enviar a SUNAT/OSE un comprobante electrónico legalmente válido correspondiente a una venta que el propio sistema marcó como anulada — inconsistencia fiscal grave, y una vez aceptado por SUNAT, la venta ya no podría anularse directamente sin una Nota de Crédito.
- **Escenario reproducible (hallazgo original):** Crear una venta → anularla sin emitir comprobante (caso de uso normal en un POS) → llamar `POST /api/facturacion/ventas/:id/emitir` para esa venta anulada: el sistema construye, firma y envía el comprobante igual.
- **Solución conceptual (hallazgo original):** No implementada en esta tarea. Conceptualmente correspondería que `emitirComprobante()` rechace explícitamente la emisión si `venta.estado === ANULADA`.
- **Pruebas necesarias (hallazgo original):** Prueba de integración que intente emitir un comprobante para una venta anulada y verifique que la operación es rechazada.
- **Criterio de aceptación:** No es posible emitir un comprobante electrónico para una venta en estado anulado, verificado con prueba automatizada. **Cumplido — ver Resolución implementada.**

#### Resolución implementada

- **`emitirComprobante()` ahora valida el estado actual de la venta.** Si `venta.estado === EstadoVenta.ANULADA`, responde `409`. La guarda ocurre inmediatamente después de confirmar que la venta existe (`if (!venta) throw 404`) y **antes** de: consultar la configuración/credenciales/certificado del OSE, generar o firmar el XML UBL, crear un nuevo `ComprobanteElectronico`, y llamar al OSE.
- **`reintentarEnvio()` quedó incluido dentro de H14** — no se dejó una ruta equivalente abierta. Ahora carga la relación actual `venta` (`relations: { venta: true }`) y exige, con la misma guarda, que la venta siga siendo facturable. Una venta anulada devuelve `409` **antes** de un nuevo envío al OSE, y el comprobante existente en `ERROR_ENVIO` no queda mutado por el intento de reintento rechazado.
- Ambas funciones reutilizan una única guarda pequeña, `validarVentaFacturable(venta: Pick<Venta, 'estado'>)`, basada en el enum ya existente `EstadoVenta.ANULADA` (sin comparaciones de string mágicas).
- **No se afirma que H14 bloquee cualquier posible condición de carrera** — ver "Concurrencia residual" más abajo.

##### Alcance conseguido

```
venta ANULADA ya confirmada y visible → emisión inicial  = 409, OSE no llamado, ComprobanteElectronico no creado
venta ANULADA ya confirmada y visible → reintento         = 409, OSE no llamado, ComprobanteElectronico existente no mutado indebidamente
```

##### Concurrencia residual

H14 **no resuelve completamente** la carrera entre `emitir`/`reintentar` y `anular` cuando ambas operaciones ocurren de forma concurrente:

1. La emisión/reintento lee el estado de la venta como `EMITIDA` (la anulación concurrente, en otra transacción, todavía no confirmó).
2. La otra transacción confirma `ANULADA`.
3. La primera operación conserva la lectura previa — no vuelve a comprobar el estado.
4. Puede continuar hasta llamar al OSE real.

No existe hoy ningún `SELECT ... FOR UPDATE` sobre `Venta` que cierre esa ventana; H14 no agregó ningún lock. Este residual **no se oculta** y **no fue introducido por H14** — ya existía exactamente igual antes de este cierre. Resolverlo requeriría estudiar conjuntamente locks/revalidación y los límites transaccionales del envío externo al OSE, lo cual está directamente vinculado a **H13** (que ya analiza el envío al OSE antes del commit local y los límites entre la transacción de base de datos y el efecto externo). **H13 permanece PENDIENTE, sin cambio de prioridad, severidad ni estado**, y no se abre un hallazgo `Hxx` nuevo para esta carrera mientras quede documentada como residual asociado a H13.

##### Evidencia T01-T05

- **T01:** venta real creada → anulada → intento de emisión → `409`; el proveedor OSE mockeado recibe **0 llamadas**; **0 filas** de `ComprobanteElectronico` para esa venta, verificado con una consulta directa a PostgreSQL. Comprobado además contra la versión previa de producción (revirtiendo temporalmente solo el archivo de servicio, con los tests ya en su lugar): sin la guarda, este mismo test obtenía `200` — confirma que el test detecta la vulnerabilidad real, no un caso vacío.
- **T02:** comprobante en `ERROR_ENVIO` → venta anulada → reintento → `409`; OSE con **0 llamadas** durante el reintento; el comprobante existente permanece exactamente igual (sin mutación indebida). También tuvo RED confirmado contra la versión previa (`200` sin la guarda).
- **T03:** venta vigente — la emisión sigue funcionando con normalidad (`200`), el OSE es llamado una vez, sin cambio de contrato HTTP respecto al comportamiento previo.
- **T04:** venta con comprobante `aceptado` — la anulación sigue rechazada y la venta permanece `EMITIDA`; la protección existente de `anularVenta()` (que también cubre `OBSERVADO`) no fue modificada.
- **T05:** el rechazo `409` es funcional y seguro — sin `stack`, sin credenciales OSE, sin contraseña ni certificado, sin XML firmado; OSE con **0 llamadas**.

#### Evidencia de validación

- `facturacion.test.ts`: **13/13 PASS**
- Relacionados (`ventas.test.ts`, `notas-venta.test.ts`, `guias-remision.test.ts`): **20/20 PASS**
- Suite backend completa: **222/222 PASS (28/28 archivos)**
- typecheck backend: **PASS**
- typecheck workspace: **FAIL únicamente** por `apps/frontend/src/routes/AppRoutes.tsx(50,1)` (`LoginPage` sin usar) — **preexistente, fuera de alcance de H14**
- lint: **PASS**, 0 errores, 2 warnings de frontend preexistentes
- build backend: **PASS**
- build frontend: **FAIL únicamente** por el mismo `LoginPage` preexistente
- `git diff --check`: **PASS** (la advertencia de Git sobre conversión LF→CRLF en `apps/backend/tests/facturacion.test.ts` es informativa del entorno Windows, no un fallo de espacios en blanco)

##### RLS / multiempresa

Codex verificó: el uso de `tenantRepository` (sin bypass de RLS), que la nueva carga de la relación `venta` en `reintentarEnvio()` corre sobre el manager de la transacción de la petición ya existente, que es carga de relación estándar de TypeORM (no SQL manual nuevo), sin ningún `empresaId` manual agregado, y sin regresión de aislamiento multiempresa demostrada.

#### Certificación Codex

`CERTIFICACIÓN CODEX — H14 APROBADO PARA CIERRE`. Codex verificó de forma independiente: el hallazgo original; el diff completo contra `HEAD`; la guarda `validarVentaFacturable`; el flujo de emisión; el flujo de reintento; el orden de los efectos (guarda antes que cualquier efecto OSE); RLS; T01-T05; la suite relacionada; la suite completa; typecheck/lint/build; la concurrencia residual; la relación con H13; y la ausencia de cambios inesperados en el resto del código.

##### Anomalía de trazabilidad

Codex comparó el working tree directamente contra el commit `7b2c85c` y confirmó que los cambios sin confirmar existentes en ese momento (`facturacion.service.ts`, `facturacion.test.ts`) correspondían exclusivamente a H14, sin contenido ajeno a este hallazgo. No se especula sobre el origen de esos cambios.

### H15 — PaymentTerms/cuotas ausentes en ventas al crédito

- **ID:** H15
- **Prioridad:** P1
- **Severidad:** MEDIA-ALTA
- **Estado:** PENDIENTE
- **Módulo afectado:** Facturación electrónica
- **Archivos implicados:**
  - `apps/backend/src/modules/facturacion/ubl/factura.builder.ts` (229 líneas, completo)
  - `apps/backend/src/modules/ventas/venta.entity.ts` (columna `forma_pago`)
  - `apps/backend/src/modules/cobranzas/cuota-venta.entity.ts`
- **Descripción:** El constructor del XML UBL 2.1 de factura no genera ningún nodo `PaymentTerms`/`PaymentMeans` ni referencia alguna a `formaPago`/cuotas, pese a que `Venta.formaPago` distingue `CONTADO`/`CREDITO` y el módulo `cobranzas` modela cuotas reales.
- **Evidencia encontrada:** Lectura completa de `factura.builder.ts`: los únicos nodos generados son los listados por el auditor (Signature, AccountingSupplierParty/CustomerParty, TaxTotal, LegalMonetaryTotal, InvoiceLine, etc.); ninguno corresponde a condiciones de pago o cuotas.
- **Impacto:** El XML UBL 2.1 firmado y enviado a SUNAT es idéntico para una venta al contado y una al crédito con cuotas — incumplimiento potencial de la ficha técnica de Factura Electrónica de SUNAT respecto al Catálogo que contempla `PaymentTerms`/`PaymentMeans` para ventas al crédito.
- **Escenario reproducible:** Emitir un comprobante para una venta con `formaPago: credito` y cuotas registradas en `cobranzas`, e inspeccionar el XML UBL generado: no contiene ninguna referencia a la condición de pago ni al cronograma de cuotas.
- **Solución conceptual:** No implementada en esta tarea. Conceptualmente correspondería agregar el nodo `PaymentTerms`/`PaymentMeans` al builder cuando `venta.formaPago === CREDITO`, con el detalle de cuotas correspondiente.
- **Pruebas necesarias:** Prueba unitaria del builder que verifique la presencia y contenido correcto del nodo `PaymentTerms` para una venta al crédito, y su ausencia (o forma correcta) para una venta al contado. El efecto exacto ante el ambiente Beta del OSE requiere prueba dinámica adicional.
- **Criterio de aceptación:** El XML UBL de una venta al crédito incluye la información de condición de pago/cuotas exigida por el catálogo SUNAT correspondiente, verificado con prueba automatizada.

### H16 — Snapshot fiscal incompleto

- **ID:** H16
- **Prioridad:** P1
- **Severidad:** MEDIO
- **Estado:** PENDIENTE
- **Módulo afectado:** Facturación electrónica / Empresa / Clientes
- **Archivos implicados:**
  - `apps/backend/src/modules/facturacion/facturacion.service.ts` (líneas 26-32, 180-183)
  - `apps/backend/src/modules/empresa/empresa.entity.ts`
  - `apps/backend/src/modules/clientes/cliente.entity.ts`
  - `apps/backend/src/modules/facturacion/ubl/factura.builder.ts` (función `construirCliente`, líneas 119-138; bloque `AccountingSupplierParty`, líneas 194-216)
- **Descripción:** Al emitir un comprobante, `facturacion.service.ts` carga los datos de `Empresa` y `Cliente` **actuales** al momento de la emisión (que puede ocurrir días o semanas después de la venta, por diseño), en vez de usar un snapshot histórico correspondiente al momento de la venta. Nota: para `Producto`/`tipoAfectacionIgv` esto **no** aplica — `DetalleVenta` sí guarda snapshot propio, confirmado por evidencia directa (falso positivo descartado para ese campo).
- **Evidencia encontrada:** `facturacion.service.ts:180-183` — la consulta de la venta para emitir incluye relaciones en vivo a `empresa` y `cliente`; no existe ninguna tabla de snapshot histórico de esos datos vinculada a `Venta`.
- **Impacto:** Si entre la venta y la emisión del comprobante se edita la razón social/dirección de la Empresa, o el nombre/documento del Cliente, el XML UBL reflejará los datos nuevos en vez de los vigentes al momento histórico de la venta — riesgo de comprobantes legales con datos fiscales incorrectos respecto al momento que representan.
- **Escenario reproducible:** Crear una venta con un cliente → editar la razón social de ese cliente → emitir el comprobante de la venta original: el XML UBL refleja la razón social nueva, no la vigente al momento de la venta.
- **Solución conceptual:** No implementada en esta tarea. Conceptualmente correspondería guardar un snapshot de los datos fiscales relevantes de Empresa y Cliente en el momento de crear la venta, similar al patrón ya usado en `DetalleVenta` para Producto.
- **Pruebas necesarias:** Prueba de integración que edite Empresa/Cliente entre la creación de la venta y la emisión del comprobante, y verifique qué datos aparecen en el XML resultante.
- **Criterio de aceptación:** El comprobante electrónico refleja los datos fiscales de Empresa y Cliente vigentes al momento de la venta, no los actuales al momento de la emisión, verificado con prueba automatizada.

---

## P2 — AUTENTICACIÓN / MULTITENANT / REALTIME

### H03 — Caché frontend entre empresas

- **ID:** H03
- **Prioridad:** P2
- **Severidad:** MEDIO
- **Estado:** PENDIENTE
- **Módulo afectado:** Frontend (TanStack Query)
- **Archivos implicados:**
  - `apps/frontend/src/main.tsx` (línea 9, 18)
  - `apps/frontend/src/context/AuthContext.tsx` (líneas 43-58)
  - `apps/frontend/src/components/AvisoSuscripcion.tsx` (líneas 45-52)
  - `apps/frontend/src/pages/Cocina.tsx`, `Fidelizacion.tsx`, `Costos.tsx` (uso de `staleTime` largo para `['configuracion']`)
- **Descripción:** El `QueryClient` es una instancia única global que no se reinicia entre sesiones; ninguna query key incluye el id de empresa/usuario; `handleLogout` no limpia la caché.
- **Evidencia encontrada:** `main.tsx:9` crea el `QueryClient` a nivel de módulo; grep exhaustivo de `queryKey:` no encuentra ninguna clave parametrizada por tenant; `AuthContext.handleLogout` no importa ni llama `useQueryClient()`/`clear()`.
- **Impacto:** En la misma pestaña del navegador, cerrar sesión de una empresa e iniciar sesión con otra puede mostrar transitoriamente (de milisegundos hasta 5-10 minutos para `configuracion`/`suscripcion`, que tienen `staleTime` largo) datos cacheados de la empresa anterior. No afecta el aislamiento a nivel de base de datos (RLS), que sigue siendo sólido.
- **Escenario reproducible:** Iniciar sesión como Empresa A, navegar por páginas que cachean datos → cerrar sesión → iniciar sesión como Empresa B en la misma pestaña, sin recarga completa → observar datos de la Empresa A mostrados brevemente.
- **Solución conceptual:** No implementada en esta tarea. Conceptualmente correspondería llamar `queryClient.clear()` en el flujo de logout (y opcionalmente también al iniciar sesión).
- **Pruebas necesarias:** Prueba de frontend que simule logout de una empresa y login de otra en la misma instancia de `QueryClient`, verificando que no se muestran datos cacheados de la empresa anterior.
- **Criterio de aceptación:** Ningún dato de una empresa permanece visible en caché tras cerrar sesión e iniciar sesión con otra empresa en la misma pestaña, verificado con prueba automatizada.

### H05 — Usuario desactivado conserva access token

- **ID:** H05
- **Prioridad:** P2
- **Severidad:** MEDIO
- **Estado:** PENDIENTE
- **Módulo afectado:** Autenticación / Autorización
- **Archivos implicados:**
  - `apps/backend/src/middlewares/auth.middleware.ts` (función `requireAuth`, líneas 33-103; función `requirePermission`, líneas 105-117)
  - `apps/backend/src/utils/jwt.ts` (líneas 4-13)
  - `apps/backend/src/modules/usuarios/usuario.service.ts`
- **Descripción:** `requireAuth` valida firma y expiración del JWT y el estado de la Empresa, pero nunca consulta la tabla `usuarios` ni su columna `activo`; los permisos comparados en `requirePermission` vienen firmados en el token desde el login, no se releen de la base en cada petición.
- **Evidencia encontrada:** Lectura directa de `requireAuth`: la única consulta a base de datos es sobre `Empresa`; ninguna sobre `Usuario`. `usuario.service.ts` (cambio de rol, desactivación) no toca `refresh_tokens` ni ningún registro de revocación de access token.
- **Impacto:** Un usuario desactivado, o al que se le retira un permiso, puede seguir operando con su access token vigente y sus permisos viejos hasta que el token expire naturalmente (`JWT_ACCESS_EXPIRES_IN`, 15 minutos por defecto).
- **Escenario reproducible:** Un administrador desactiva a un usuario o le quita un permiso mientras ese usuario tiene un access token vigente → el usuario sigue realizando operaciones con los permisos anteriores hasta que el token expire.
- **Solución conceptual:** No implementada en esta tarea. Conceptualmente correspondería reconsultar el estado/permisos del usuario en cada petición, o reducir la ventana de expiración del access token, o introducir un mecanismo de invalidación activa.
- **Pruebas necesarias:** Prueba de integración que desactive a un usuario (o le retire un permiso) mientras tiene un access token vigente, y verifique en qué momento deja de poder operar.
- **Criterio de aceptación:** Un usuario desactivado o sin un permiso pierde la capacidad de usarlo en un plazo acotado y verificado, documentado y probado.

### H07 — Race condition en refresh token

- **ID:** H07
- **Prioridad:** P2
- **Severidad:** MEDIO
- **Estado:** PENDIENTE
- **Módulo afectado:** Autenticación
- **Archivos implicados:**
  - `apps/backend/src/modules/auth/auth.service.ts` (función `refrescarSesion`, líneas 86-128)
  - `apps/backend/src/modules/auth/refresh-token.entity.ts`
- **Descripción:** `refrescarSesion` busca el refresh token por hash con un `SELECT` simple (sin `FOR UPDATE` ni lock), verifica que no esté revocado, y solo después marca la revocación con un `save()` separado sin condición `WHERE revocado = false`.
- **Evidencia encontrada:** Lectura línea por línea de `refrescarSesion`; cada petición HTTP corre en su propia transacción (`tenant.middleware.ts`), sin ningún mecanismo de sincronización compartido entre peticiones concurrentes que usen el mismo refresh token.
- **Impacto:** Dos peticiones concurrentes con el mismo refresh token pueden ambas pasar la validación de "no revocado" antes de que cualquiera marque la revocación, resultando en que ambas obtengan pares de tokens nuevos válidos — rompe la semántica de "un solo uso" que debería permitir detectar el reuso de un token robado.
- **Escenario reproducible:** Disparar dos peticiones `POST /api/auth/refrescar` simultáneas con el mismo refresh token válido y observar que ambas tienen éxito.
- **Solución conceptual:** No implementada en esta tarea. Conceptualmente correspondería usar `SELECT ... FOR UPDATE` o una condición `WHERE revocado = false` en el `UPDATE` de revocación, para que solo una de las peticiones concurrentes tenga éxito.
- **Pruebas necesarias:** Prueba de integración que dispare dos refrescos concurrentes con el mismo token y verifique que solo uno tiene éxito.
- **Criterio de aceptación:** Un refresh token solo puede usarse exitosamente una vez, incluso bajo peticiones concurrentes, verificado con prueba automatizada.

#### Nota posterior a H06

La implementación de H06 introduce `SELECT ... FOR UPDATE` (`pessimistic_write`) sobre la fila de `Usuario` en `refrescarSesion`, adquirido antes de leer o tocar `refresh_tokens`. Esto serializa, para el mismo usuario, cualquier `refrescarSesion` concurrente: dos peticiones de refresco simultáneas con el mismo token ya no pueden intercalar sus lecturas libremente, porque ambas compiten por el mismo lock de fila.

Codex clasificó el efecto sobre H07 como **APARENTEMENTE RESUELTO POR EFECTO COLATERAL**, con el siguiente razonamiento:

```
R1 obtiene el lock → revalida → revoca R1 → crea reemplazo → commit
R2 espera el lock → lo obtiene → revalida el token ORIGINAL → lo observa revocado → 401
```

**Pero H07 permanece PENDIENTE.** El lock que agregó H06 protege la propiedad que H06 necesitaba (serializar `cambiarPassword` contra `refrescarSesion`), no fue diseñado ni auditado específicamente para la garantía de "un solo uso" de H07 (dos refrescos concurrentes con el **mismo** token). Antes de poder cerrarlo, H07 debe recibir su propia auditoría dedicada, sus propios tests específicos (incluida la variante exacta de su escenario reproducible: dos `POST /api/auth/refrescar` simultáneos con el mismo token) y verificación de todas sus variantes — no se afirma que H07 esté formalmente resuelto por este efecto colateral.

### H23 — Revalidación del refresh no filtra explícitamente por usuario_id

- **ID:** H23
- **Prioridad:** P2
- **Severidad:** BAJO
- **Estado:** PENDIENTE
- **Módulo afectado:** Autenticación
- **Archivos implicados:**
  - `apps/backend/src/modules/auth/auth.service.ts` (función `refrescarSesion`, revalidación posterior al lock)
- **Descripción:** Detectado por Codex durante la certificación de H06 (H06-R01). La consulta que revalida el refresh token después de obtener el lock de `Usuario` identifica la fila únicamente por `tokenHash` (`refreshTokenRepository.findOneBy({ tokenHash: ... })`), sin expresar también, a nivel de consulta, que esa fila pertenezca al mismo `usuario_id` que ya se bloqueó (`payload.sub`).
- **Evidencia encontrada:** Lectura directa de `refrescarSesion`. Hoy el invariante "el `tokenHash` pertenece al usuario bloqueado" se sostiene por construcción, no por la consulta: el JWT de refresh está firmado (no falsificable sin el secreto), `sub` identifica al usuario dueño del token, `token_hash` es único (índice `UNIQUE` en `refresh_tokens`), la fila se crea siempre para ese mismo usuario en `emitirSesion`, y no existe ningún flujo en el sistema que reasigne `usuario_id` de una fila de `refresh_tokens` ya creada. No se encontró ningún camino de bypass real: **no es una vulnerabilidad demostrada**, y no bloqueó el cierre de H06.
- **Impacto:** Ninguno demostrado actualmente. Es un endurecimiento defensivo: expresar `usuario_id = :usuarioId` explícitamente en la consulta de revalidación haría que la invariante quedara verificada por la base de datos en cada lectura, en vez de depender únicamente de que ningún otro flujo del sistema pueda romperla en el futuro.
- **Escenario reproducible:** No reproducible con el código actual — no existe ningún flujo que produzca un `tokenHash` válido asociado a un `usuario_id` distinto del firmante del JWT.
- **Solución conceptual:** No implementada en esta tarea. Conceptualmente correspondería agregar `usuario_id: payload.sub` (o el id del usuario ya bloqueado) a la condición `WHERE` de la consulta de revalidación en `refrescarSesion`.
- **Pruebas necesarias:** Prueba que confirme que la consulta de revalidación exige explícitamente la coincidencia de `usuario_id`, y prueba de regresión que confirme que el flujo normal de refresco no se ve afectado.
- **Criterio de aceptación:** La revalidación del refresh token, tras el lock, verifica explícitamente en la consulta que el token pertenece al usuario bloqueado, verificado con prueba automatizada. No bloquea el cierre de H06 (ver H06, Certificación Codex).

### H24 — Inconsistencia entre JWT_REFRESH_EXPIRES_IN y refreshExpiresInMs

- **ID:** H24
- **Prioridad:** P2
- **Severidad:** BAJO
- **Estado:** PENDIENTE
- **Módulo afectado:** Autenticación / Configuración
- **Archivos implicados:**
  - `apps/backend/src/config/env.ts` (línea 56-57: `refreshExpiresIn` vs. `refreshExpiresInMs`)
  - `apps/backend/src/modules/auth/auth.service.ts` (`emitirSesion`, uso de `refreshExpiresInMs`)
  - `apps/backend/src/config/cookies.ts` (`maxAge` de la cookie de refresh)
- **Descripción:** Confirmado durante la certificación de H06 (H06-R02). `JWT_REFRESH_EXPIRES_IN` controla el `exp` criptográfico firmado dentro del propio JWT de refresh, mientras que `refreshExpiresInMs` está hardcodeado a `7 * 24 * 60 * 60 * 1000` (7 días) en `env.ts:57` y controla, por separado, `refresh_tokens.expira_en` (la expiración que valida `refrescarSesion` contra la base) y el `maxAge` de la cookie de refresh. Si se cambia `JWT_REFRESH_EXPIRES_IN` sin tocar `refreshExpiresInMs`, ambos valores divergen.
- **Evidencia encontrada:** `env.ts:52-57` — `refreshExpiresIn` lee `process.env.JWT_REFRESH_EXPIRES_IN` con default `'7d'`; `refreshExpiresInMs` es un literal numérico fijo, sin relación con la variable anterior. `emitirSesion` (`auth.service.ts:39`) usa `refreshExpiresInMs` para `expiraEn` de la fila en base; `cookies.ts:26` usa el mismo valor para `maxAge`.
- **Impacto:** Configuración engañosa y comportamiento inconsistente, no un bypass de seguridad — no existe ningún camino que permita superar simultáneamente ambos controles (el JWT y la fila en base deben seguir siendo válidos a la vez para que un refresh tenga éxito, `refrescarSesion` comprueba ambos). Dos casos: (a) si `JWT_REFRESH_EXPIRES_IN` se configura más corto que 7 días, la firma del JWT expira antes de que la cookie/base lo hicieran, y el usuario pierde la sesión antes de lo que la configuración sugiere; (b) si se configura más largo, la fila en base y la cookie expiran a los 7 días igual, cortando la sesión antes de lo que `JWT_REFRESH_EXPIRES_IN` sugiere — en ambos casos el operador que configuró la variable ve un comportamiento distinto al que esperaba.
- **Escenario reproducible:** Configurar `JWT_REFRESH_EXPIRES_IN=30d`, iniciar sesión, y observar que la cookie de refresh y la fila de `refresh_tokens` igualmente expiran a los 7 días (`refreshExpiresInMs` sigue hardcodeado), no a los 30 configurados.
- **Solución conceptual:** No implementada en esta tarea. Conceptualmente correspondería derivar `refreshExpiresInMs` de `JWT_REFRESH_EXPIRES_IN` (parseando la misma cadena de duración) en vez de mantener un literal separado, o exponer una única fuente de verdad para ambos.
- **Pruebas necesarias:** Prueba que configure `JWT_REFRESH_EXPIRES_IN` con un valor distinto del default y verifique que `refresh_tokens.expira_en` y el `maxAge` de la cookie coinciden con esa configuración.
- **Criterio de aceptación:** La expiración efectiva de la sesión (JWT, fila en base y cookie) responde de forma consistente a una única configuración, verificado con prueba automatizada. No bloquea el cierre de H06.

### H08 — Socket.IO sin autorización granular

- **ID:** H08
- **Prioridad:** P2
- **Severidad:** MEDIO
- **Estado:** PENDIENTE
- **Módulo afectado:** Realtime / Notificaciones
- **Archivos implicados:**
  - `apps/backend/src/realtime/socket.ts` (completo)
  - `apps/backend/src/modules/notificaciones/notificacion.service.ts` (líneas 26-42)
  - `apps/backend/src/modules/notificaciones/notificacion.routes.ts` (línea 9)
  - `apps/backend/src/modules/reclamaciones/reclamacion.routes.ts` (línea 11)
- **Descripción:** El middleware de conexión de Socket.IO valida la firma y expiración del JWT en el handshake, pero no vuelve a verificarlo durante la vida del socket, ni filtra los eventos difundidos por permiso específico del destinatario.
- **Evidencia encontrada:** El evento `notificacion:nueva` difunde a toda la sala de la empresa (`emitirAEmpresa`) el contenido completo de la notificación —incluyendo, para reclamos, el texto literal del cliente— sin exigir el permiso `notificaciones.ver`/`reclamaciones.ver` que sí exigen las rutas HTTP equivalentes.
- **Impacto:** Cualquier usuario conectado por socket de una empresa (independientemente de su rol/permisos) recibe por WebSocket contenido que la API REST equivalente le negaría con 403; adicionalmente, un socket ya conectado no se desconecta automáticamente si el token usado para conectar expira o el usuario es desactivado.
- **Escenario reproducible:** Conectar por Socket.IO con un usuario sin permiso `reclamaciones.ver` y observar que igualmente recibe el evento `notificacion:nueva` con el texto de un reclamo nuevo.
- **Solución conceptual:** No implementada en esta tarea. Conceptualmente correspondería filtrar la difusión de eventos sensibles por permiso del socket destinatario, y/o desconectar sockets cuyo token de conexión haya expirado.
- **Pruebas necesarias:** Prueba que conecte un socket con un usuario sin el permiso correspondiente y verifique si recibe o no el evento con datos sensibles.
- **Criterio de aceptación:** Los eventos de Socket.IO con datos sensibles solo llegan a usuarios con el permiso equivalente al de la ruta HTTP correspondiente, verificado con prueba automatizada.

### H12 — Pedido abierto duplicable por mesa

- **ID:** H12
- **Prioridad:** P2
- **Severidad:** MEDIO
- **Estado:** PENDIENTE
- **Módulo afectado:** Pedidos / Mesas
- **Archivos implicados:**
  - `apps/backend/src/modules/pedidos/pedido.entity.ts`
  - `apps/backend/src/modules/pedidos/pedido.service.ts` (líneas 130-142, 189-207)
  - `apps/backend/src/modules/caja/caja.entity.ts` (líneas 29-32, patrón de referencia con índice único parcial)
- **Descripción:** No existe ningún índice único parcial en `pedidos` que garantice "un solo pedido abierto por mesa" a nivel de base de datos, a diferencia del patrón ya aplicado en `cajas` y `turnos` en este mismo codebase. La única protección es un `findOneBy` en la aplicación antes de insertar (check-then-insert), tanto en el flujo autenticado como en el autopedido público.
- **Evidencia encontrada:** Lectura completa de `pedido.entity.ts` (sin `@Index`/`@Unique` sobre `mesa`/`estado`) contrastada contra `caja.entity.ts:29-32` y la migración de turnos, que sí implementan el patrón.
- **Impacto:** Dos peticiones concurrentes para la misma mesa (dos autopedidos simultáneos, o dos clics/dispositivos de un mesero) pueden ambas pasar el chequeo de "no hay pedido abierto" antes de que cualquiera complete su inserción, resultando en dos pedidos abiertos simultáneos para la misma mesa.
- **Escenario reproducible:** Disparar dos peticiones concurrentes de creación de pedido para la misma mesa (sin pedido abierto previo) y observar si ambas tienen éxito.
- **Solución conceptual:** No implementada en esta tarea. Conceptualmente correspondería agregar un índice único parcial sobre `(mesa_id)` con `WHERE estado = 'abierto'`, igual patrón que el ya usado en `cajas`/`turnos`.
- **Pruebas necesarias:** Prueba de integración que dispare dos creaciones de pedido concurrentes para la misma mesa y verifique que solo una tiene éxito.
- **Criterio de aceptación:** Nunca existen dos pedidos en estado `abierto` para la misma mesa, garantizado a nivel de base de datos y verificado con prueba automatizada.

### H22 — Notas de detalle expuestas en el contrato público de pedidos

- **ID:** H22
- **Prioridad:** P2
- **Severidad:** BAJO
- **Estado:** PENDIENTE
- **Módulo afectado:** Pedidos / Carta pública
- **Archivos implicados:**
  - `apps/backend/src/modules/pedidos/pedido.mapper.ts` (campo `notas` dentro de `detalles`, allowlist de `pedidoPublico()`)
- **Descripción:** Detectado por Codex durante la certificación de H04. El mapper público `pedidoPublico()` incluye `detalle.notas` en cada línea del pedido. Hoy ese campo representa exclusivamente instrucciones del propio detalle escritas por quien creó la línea (ej. "sin cebolla") — no hay evidencia de que el staff lo use como anotación interna. Pero si en el futuro el personal (mesero/cocina) llegara a reutilizar ese mismo campo para un comentario interno sobre esa línea, ese comentario quedaría visible en la respuesta pública de un autopedido posterior que se una al mismo pedido (ver H04-T02, el mecanismo de "unirse a un pedido ya abierto" sigue vigente para el mismo canal).
- **Evidencia encontrada:** Lectura de `pedido.mapper.ts`: `notas: detalle.notas` sin distinción de origen. No se encontró, en el código actual, ningún flujo que escriba en `detalle.notas` desde una pantalla interna de staff distinta a la que ya usa el propio pedido (`agregarDetalle`/`actualizarDetalle`, ambos con el mismo campo para cualquier origen). Es una observación preventiva, no una fuga demostrada con el código de hoy.
- **Impacto:** Ninguno demostrado actualmente. Es un endurecimiento preventivo ante un uso futuro del campo (comentario interno) que hoy no ocurre.
- **Escenario reproducible:** No reproducible con el comportamiento actual — `notas` de detalle solo contiene hoy lo que el propio remitente (cliente o mesero) escribió para esa línea, dato que ya conoce.
- **Solución conceptual:** No implementada en esta tarea. Conceptualmente correspondería decidir explícitamente uno de dos caminos: (a) documentar formalmente `detalle.notas` como un campo siempre visible al cliente, dejando constancia de que el staff no debe usarlo para comentarios internos; o (b) separar en el modelo una nota pública (la del pedido) de una nota interna del staff, y excluir esta última de `pedidoPublico()`.
- **Pruebas necesarias:** Prueba automatizada que confirme el comportamiento que se decida (visibilidad explícita de `notas`, o separación de campos público/interno).
- **Criterio de aceptación:** El contrato de `notas` de detalle queda documentado explícitamente como público, o separado en dos campos sin ambigüedad, verificado con prueba automatizada. No bloquea el cierre de H04.

---

## P2 — RENDIMIENTO

### H10 — registrarUso serializa peticiones de una empresa

- **ID:** H10
- **Prioridad:** P2
- **Severidad:** ALTO
- **Estado:** PENDIENTE
- **Módulo afectado:** Suscripción / Infraestructura transaccional
- **Archivos implicados:**
  - `apps/backend/src/modules/suscripcion/suscripcion.service.ts` (función `registrarUso`, líneas 129-140)
  - `apps/backend/src/modules/suscripcion/registro-uso.repository.ts`
  - `apps/backend/src/middlewares/auth.middleware.ts` (línea 96)
  - `apps/backend/src/middlewares/tenant.middleware.ts`
- **Descripción:** `registrarUso` ejecuta un `INSERT ... ON CONFLICT (empresa_id, fecha) DO UPDATE` dentro de la transacción por petición, y se llama desde `requireAuth` **antes** de que se ejecute el controlador de la ruta. En Postgres, esta operación toma un lock de fila sobre `(empresa_id, fecha)` que se mantiene hasta el `COMMIT` de la transacción — que en este diseño ocurre al final de toda la petición.
- **Evidencia encontrada:** Confirmado por lectura directa: `auth.middleware.ts:96` llama `await registrarUso(...)` en la línea inmediatamente anterior a `next()` (línea 98); `registrarUso` corre sobre el manager de la transacción de la petición completa, cuyo commit ocurre justo antes de enviar la respuesta (`tenant.middleware.ts`).
- **Impacto:** Cualquier segunda petición autenticada concurrente de la **misma empresa** en el **mismo día** queda bloqueada en ese `INSERT` hasta que la primera petición termine por completo (controlador, servicios, toda su lógica) y confirme — serializa de facto las peticiones autenticadas de una empresa bajo uso concurrente normal (varios meseros/cajeros operando a la vez).
- **Escenario reproducible:** Disparar dos peticiones autenticadas concurrentes de la misma empresa (mismo día) y medir el tiempo de respuesta de la segunda frente a que la primera tarde en completarse.
- **Solución conceptual:** No implementada en esta tarea. Conceptualmente correspondería mover `registrarUso` fuera del alcance de la transacción principal de la petición (ej. una conexión/transacción propia y corta), o registrar el uso al final de la petición en vez de al inicio.
- **Pruebas necesarias:** Prueba de rendimiento/concurrencia que mida el tiempo de la segunda petición concurrente de la misma empresa frente al de la primera.
- **Criterio de aceptación:** Dos peticiones concurrentes autenticadas de la misma empresa no se serializan por causa de `registrarUso`, verificado con prueba de concurrencia.

---

# REGLAS DE CORRECCIÓN

1. Resolver un hallazgo por vez.
2. Crear o ampliar pruebas antes o durante la corrección.
3. No mezclar refactors no relacionados.
4. Claude Code realizará la implementación principal.
5. Codex realizará revisión independiente del cambio.
6. Ejecutar tests, lint y build correspondientes.
7. No marcar un hallazgo como RESUELTO sin evidencia de pruebas.
8. Realizar commits pequeños y coherentes.
9. No agregar funcionalidades nuevas mientras exista un P0 abierto.
10. Mantener este backlog actualizado.
11. No eliminar funcionalidades existentes sin autorización.
12. No cambiar el stack tecnológico sin autorización.

---

# FLUJO DE ESTADOS

PENDIENTE
→ EN ANÁLISIS
→ EN DESARROLLO
→ EN REVISIÓN CODEX
→ CORRECCIÓN DE OBSERVACIONES
→ PRUEBAS
→ RESUELTO
