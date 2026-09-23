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
- **Estado:** PENDIENTE
- **Módulo afectado:** Auditoría / Facturación electrónica
- **Archivos implicados:**
  - `apps/backend/src/modules/auditoria/auditoria.middleware.ts` (líneas 12-22, lista `CAMPOS_SENSIBLES`; línea 87)
  - `apps/backend/src/modules/facturacion/facturacion.dto.ts` (línea 10, campo `oseClave`)
  - `apps/backend/src/modules/facturacion/facturacion.routes.ts` (líneas 21-26)
- **Descripción:** La lista `CAMPOS_SENSIBLES` de redacción del middleware de auditoría compara por igualdad exacta (en minúsculas) y no incluye `oseclave`. El campo `oseClave` del DTO de configuración de facturación (credencial del proveedor OSE) no coincide con ninguno de los nombres de la lista.
- **Evidencia encontrada:** `express.json()` parsea el body antes de que `auditoriaMiddleware` lo copie (`app.ts`, orden de middlewares); `redactar(req.body)` no aplica ninguna transformación a `oseClave` porque no está en `CAMPOS_SENSIBLES`. El cifrado AES-256-GCM de `utils/cifrado.ts` protege la tabla `configuraciones_facturacion`, pero eso ocurre en una capa posterior y distinta de la bitácora de auditoría.
- **Impacto:** La contraseña/credencial del proveedor OSE (NubeFacT) queda registrada en texto plano en `registro_auditoria` cada vez que un administrador actualiza `PUT /api/facturacion/configuracion`, accesible a cualquiera con permiso de lectura de auditoría, acceso directo a la base o a un respaldo/dump.
- **Escenario reproducible:** Un administrador con permiso `facturacion.configurar` llama `PUT /api/facturacion/configuracion` con `oseClave` en el body → la fila de auditoría resultante contiene `oseClave` en claro dentro de la columna `datos` (jsonb).
- **Solución conceptual:** No implementada en esta tarea. Conceptualmente, agregar `oseclave` (y revisar nombres equivalentes) a `CAMPOS_SENSIBLES`, o redactar por patrón en vez de por igualdad exacta.
- **Pruebas necesarias:** Prueba de integración que verifique que al llamar `PUT /api/facturacion/configuracion` con `oseClave`, la fila de auditoría resultante no contiene ese valor en claro.
- **Criterio de aceptación:** Ninguna fila de `registro_auditoria` contiene la credencial del OSE en texto plano, verificado con una prueba automatizada.

### H04 — Autopedido público y exposición de PII

- **ID:** H04
- **Prioridad:** P0
- **Severidad:** ALTO
- **Estado:** PENDIENTE
- **Módulo afectado:** Pedidos / Carta pública
- **Archivos implicados:**
  - `apps/backend/src/modules/carta-publica/carta-publica.routes.ts` (líneas 79-88)
  - `apps/backend/src/modules/pedidos/pedido.service.ts` (líneas 182-244, función `crearPedidoPublico`)
  - `apps/backend/src/modules/pedidos/pedido.entity.ts`
  - `apps/backend/src/modules/clientes/cliente.entity.ts` (líneas 28-56)
  - `apps/backend/src/utils/api-response.ts` (líneas 3-5)
- **Descripción:** El endpoint público `POST /:slug/pedidos` (autopedido, sin autenticación) busca cualquier pedido `abierto` en la mesa indicada sin filtrar por canal de origen (`canalOrigen`), y lo reutiliza si existe — incluso si ese pedido fue abierto por un mesero autenticado con un `cliente` asociado. La respuesta se serializa completa, sin mapper que oculte datos de contacto.
- **Evidencia encontrada:** `pedido.service.ts:191-194`, `findOneBy({ mesa: {id}, estado: ABIERTO })` sin condición sobre `canalOrigen`; `RELACIONES` de la consulta incluye `cliente: true`; `sendSuccess` (`api-response.ts`) serializa el objeto tal cual sin filtrar campos.
- **Impacto:** Cualquier persona con el enlace/QR de una mesa (UUID compartible sin expiración) puede recibir en la respuesta datos personales del cliente asociado al pedido existente (nombres/razón social, documento de identidad, teléfono, email, dirección) y ver/agregar líneas a un pedido ajeno, sin autenticarse ni estar físicamente presente.
- **Escenario reproducible:** Un mesero abre un pedido de salón en la Mesa 5 con un cliente fidelizado asociado → un tercero con el enlace `/carta/:slug?mesa=<uuid>` llama `POST /api/publico/:slug/pedidos` con `canalOrigen: AUTOPEDIDO` y el mismo `mesaId` → recibe en la respuesta el pedido completo, incluyendo el objeto `cliente` con sus datos personales.
- **Solución conceptual:** No implementada en esta tarea. Conceptualmente correspondería filtrar la reutilización de pedido por canal de origen y/o aplicar un mapper público que excluya datos de `cliente`/PII en la respuesta del autopedido.
- **Pruebas necesarias:** Prueba de integración que confirme que el endpoint público de autopedido nunca devuelve datos de `cliente` (documento, teléfono, email, dirección) ni permite modificar un pedido abierto por otro canal de origen.
- **Criterio de aceptación:** El endpoint público de autopedido no expone PII de clientes en su respuesta y no permite modificar pedidos abiertos por meseros/otros comensales sin un mecanismo de verificación, con evidencia de prueba automatizada.

### H06 — Cambio de contraseña no revoca sesiones

- **ID:** H06
- **Prioridad:** P0
- **Severidad:** ALTO
- **Estado:** PENDIENTE
- **Módulo afectado:** Autenticación
- **Archivos implicados:**
  - `apps/backend/src/modules/auth/auth.service.ts` (función `cambiarPassword`)
  - `apps/backend/src/modules/auth/auth.controller.ts`
  - Tabla `refresh_tokens` (columna `revocado`)
- **Descripción:** La función de cambio de contraseña valida la contraseña actual, hashea la nueva y guarda el usuario, pero no revoca ningún registro en `refresh_tokens` del mismo usuario. No existe blacklist de access tokens (diseño JWT stateless).
- **Evidencia encontrada:** Búsqueda exhaustiva de `revocado = true` en `src/` solo la encuentra en `refrescarSesion` y `logout` de `auth.service.ts` — ninguna referencia desde `cambiarPassword`.
- **Impacto:** Cambiar la contraseña —el control que un usuario usa típicamente ante sospecha de robo de sesión— no cierra ninguna sesión existente: cualquier refresh token vigente en otro dispositivo sigue pudiendo renovar la sesión indefinidamente, y cualquier access token ya emitido sigue funcionando hasta su expiración natural.
- **Escenario reproducible:** Usuario detecta actividad sospechosa y cambia su contraseña desde un dispositivo → un refresh token robado/vigente en otro dispositivo sigue llamando `POST /api/auth/refrescar` con éxito después del cambio.
- **Solución conceptual:** No implementada en esta tarea. Conceptualmente correspondería revocar todos los `refresh_tokens` activos del usuario al cambiar la contraseña.
- **Pruebas necesarias:** Prueba de integración que verifique que, tras cambiar la contraseña, un refresh token emitido previamente ya no puede renovar la sesión.
- **Criterio de aceptación:** Cambiar la contraseña revoca todas las sesiones (refresh tokens) previas del usuario, verificado con prueba automatizada.

---

## P1 — INTEGRIDAD DEL NÚCLEO

### H09 — Commit fallido puede devolver respuesta exitosa

- **ID:** H09
- **Prioridad:** P1
- **Severidad:** ALTO
- **Estado:** PENDIENTE
- **Módulo afectado:** Infraestructura transaccional (transversal a todo el backend)
- **Archivos implicados:**
  - `apps/backend/src/middlewares/tenant.middleware.ts` (líneas 63-106)
- **Descripción:** La función `cerrar()` que confirma o revierte la transacción por petición atrapa cualquier error de `commitTransaction()` únicamente con `logger.error(...)`, sin relanzarlo ni alterar la respuesta. El `res.end` interceptado siempre llama a la función original de envío tras `cerrar()`, sin importar si el commit tuvo éxito.
- **Evidencia encontrada:** `tenant.middleware.ts:77-78` (`catch` que solo registra el fallo) y `tenant.middleware.ts:101-106` (el `.then()` del `res.end` interceptado se ejecuta siempre, incluso si `cerrar()` no logró confirmar). Verificado independientemente por ambos auditores con conclusión idéntica.
- **Impacto:** Si `commitTransaction()` falla (p. ej. por un corte de conexión con Postgres en el instante del commit), el cliente recibe una respuesta 200/201 de éxito con un body que describe una operación como completada, mientras que en la base de datos esa operación no existe en absoluto (un COMMIT de Postgres es atómico: no hay persistencia parcial, sino "éxito fantasma").
- **Escenario reproducible:** Provocar un fallo transitorio de conexión a Postgres exactamente durante el `COMMIT` de una petición de escritura (ej. crear una venta) y observar que el cliente recibe 200 pese a que la fila no queda en la base.
- **Solución conceptual:** No implementada en esta tarea. Conceptualmente correspondería que, si el commit falla tras haberse preparado una respuesta de éxito, la respuesta enviada se sustituya por un error (5xx) antes de llamar a la función original de envío.
- **Pruebas necesarias:** Prueba que simule un fallo de `commitTransaction()` (mock/inyección de fallo) y verifique que la respuesta HTTP resultante refleja el error, no el éxito original del controlador.
- **Criterio de aceptación:** Ante un fallo de `commitTransaction()`, el cliente nunca recibe una respuesta de éxito para esa petición, verificado con prueba automatizada.

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
- **Estado:** PENDIENTE
- **Módulo afectado:** Facturación electrónica / Ventas
- **Archivos implicados:**
  - `apps/backend/src/modules/facturacion/facturacion.service.ts` (función `emitirComprobante`, líneas 179-231)
  - `apps/backend/src/modules/ventas/venta.service.ts` (función `anularVenta`, líneas 515-551)
- **Descripción:** `emitirComprobante()` valida que la venta exista y que no tenga ya un comprobante en un estado distinto de `ERROR_ENVIO`, pero nunca lee ni compara `venta.estado`. Por su parte, `anularVenta()` permite anular una venta que no tiene comprobante emitido (o que tiene uno en `ERROR_ENVIO`/`RECHAZADO`/`PENDIENTE`).
- **Evidencia encontrada:** Confirmado por lectura directa de ambas funciones: ninguna de las dos impide, en conjunto, que una venta ya anulada sea posteriormente facturada.
- **Impacto:** Se puede generar y enviar a SUNAT/OSE un comprobante electrónico legalmente válido correspondiente a una venta que el propio sistema marcó como anulada — inconsistencia fiscal grave, y una vez aceptado por SUNAT, la venta ya no podría anularse directamente sin una Nota de Crédito.
- **Escenario reproducible:** Crear una venta → anularla sin emitir comprobante (caso de uso normal en un POS) → llamar `POST /api/facturacion/ventas/:id/emitir` para esa venta anulada: el sistema construye, firma y envía el comprobante igual.
- **Solución conceptual:** No implementada en esta tarea. Conceptualmente correspondería que `emitirComprobante()` rechace explícitamente la emisión si `venta.estado === ANULADA`.
- **Pruebas necesarias:** Prueba de integración que intente emitir un comprobante para una venta anulada y verifique que la operación es rechazada.
- **Criterio de aceptación:** No es posible emitir un comprobante electrónico para una venta en estado anulado, verificado con prueba automatizada.

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
