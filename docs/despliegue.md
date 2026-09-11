# Despliegue

Guía para poner el sistema en línea: base de datos, backend y frontend. Cubre opciones
gratuitas y de pago, y —más importante— **las cuatro cosas de este proyecto en concreto que
rompen un despliegue hecho a ciegas**.

> Este documento describe el procedimiento. El sistema todavía **no se ha desplegado**: las
> instrucciones están verificadas contra el código y la configuración real, no contra un
> despliegue ya hecho.

---

## 1. Antes de elegir proveedor: lo que este sistema exige

No es una aplicación genérica. Cuatro particularidades condicionan qué servicios sirven.

### 1.1. La base de datos necesita **dos roles**, y el de la app no puede ser superusuario

El aislamiento entre empresas se apoya en Row-Level Security de Postgres (ver
`decisiones-tecnicas.md`). **Un superusuario se salta RLS siempre**, incluso con `FORCE ROW
LEVEL SECURITY`. Por eso hay dos roles:

| Rol                               | Para qué             | Requisito                          |
| --------------------------------- | -------------------- | ---------------------------------- |
| `DB_USER` / `DB_PASSWORD`         | Ejecutar migraciones | Dueño de las tablas                |
| `DB_APP_USER` / `DB_APP_PASSWORD` | Atender peticiones   | **Sin `SUPERUSER` ni `BYPASSRLS`** |

Si despliegas con un solo rol superusuario, el sistema **funciona igual pero sin
aislamiento**: cualquier restaurante vería los datos de los demás. Es el error más caro que
se puede cometer acá, y no da ningún síntoma visible.

La migración `RolAplicacionSinBypassRls` crea el segundo rol automáticamente, así que el
proveedor de base de datos tiene que **permitir `CREATE ROLE`**. La sección 3 dice cuáles lo
permiten.

### 1.2. Las fotos de productos se guardan en disco

`multer` escribe en `apps/backend/uploads/` y Express las sirve en `/uploads`. En casi todos
los planes gratuitos de PaaS **el disco es efímero**: se borra en cada despliegue y en cada
reinicio. Las fotos de la carta desaparecerían solas.

Opciones, de menor a mayor esfuerzo:

1. **Disco persistente** del proveedor (Render Disks, Railway Volumes, Fly Volumes) montado
   en `apps/backend/uploads`. Es un cambio de configuración, cero código. **Recomendado para
   empezar.** Contra: ata el backend a una sola instancia (no escala horizontalmente).
2. **Almacenamiento de objetos** (Cloudflare R2, Backblaze B2, S3). Escala y es barato, pero
   **requiere código que todavía no existe**: cambiar `config/uploads.ts` de `diskStorage` a
   un cliente del proveedor. No está implementado; es trabajo pendiente si se necesita.

Si el plan no ofrece disco persistente y no se implementa (2), el sistema funciona pero hay
que volver a subir las fotos después de cada despliegue.

### 1.3. El frontend y el backend en dominios distintos rompen la sesión

La sesión usa un refresh token en cookie `httpOnly`. Con el frontend en un dominio y el
backend en otro, `sameSite: 'lax'` hace que el navegador **no envíe** la cookie. El síntoma
es engañoso: el login funciona, pero al recargar la página el usuario aparece deslogueado.

Solución: `COOKIE_CROSS_SITE=true` en el backend. Eso pone `sameSite: 'none'` + `secure:
true`, que **exige HTTPS en ambos lados** (todos los proveedores de esta guía lo dan).

Si en cambio sirves el frontend y el backend bajo el **mismo dominio** (por ejemplo el
frontend en `mi-erp.com` y el backend en `mi-erp.com/api` vía proxy inverso), déjalo en
`false`: es la configuración más segura de las dos.

### 1.4. Detrás de un balanceador hay que configurar `TRUST_PROXY`

Todos los PaaS ponen un balanceador delante. Sin `TRUST_PROXY=1`, Express ve la IP del
balanceador en vez de la del visitante, y el limitador de peticiones **cuenta a todos los
usuarios como uno solo** y los bloquea en conjunto.

---

## 2. Variables de entorno

El backend falla al arrancar si falta alguna obligatoria (`config/env.ts`), que es
deliberado: mejor no arrancar que arrancar mal configurado.

| Variable                  | Obligatoria | Valor en producción                                            |
| ------------------------- | ----------- | -------------------------------------------------------------- |
| `NODE_ENV`                | —           | `production`                                                   |
| `PORT`                    | —           | El que inyecte el proveedor (Render/Railway lo hacen solos)    |
| `CORS_ORIGIN`             | —           | URL exacta del frontend, con `https://` y sin barra final      |
| `TRUST_PROXY`             | —           | `1` en cualquier PaaS                                          |
| `COOKIE_CROSS_SITE`       | —           | `true` si el frontend está en otro dominio                     |
| `DB_HOST`                 | Sí          | Host del Postgres gestionado                                   |
| `DB_PORT`                 | Sí          | `5432` normalmente                                             |
| `DB_NAME`                 | Sí          |                                                                |
| `DB_USER` / `DB_PASSWORD` | Sí          | Rol dueño. **Solo para migraciones**                           |
| `DB_APP_USER`             | Sí          | `restaurant_erp_app`                                           |
| `DB_APP_PASSWORD`         | Sí          | Clave larga y aleatoria. La migración crea el rol con ella     |
| `JWT_ACCESS_SECRET`       | Sí          | **Distinto** del de refresh. Ver más abajo cómo generarlos     |
| `JWT_REFRESH_SECRET`      | Sí          | **Distinto** del de acceso                                     |
| `JWT_ACCESS_EXPIRES_IN`   | —           | `15m`                                                          |
| `JWT_REFRESH_EXPIRES_IN`  | —           | `7d`                                                           |
| `PROVEEDOR_NOMBRE`        | —           | Tu nombre: lo ve el restaurante cuando su prueba vence         |
| `PROVEEDOR_EMAIL`         | —           | Tu correo                                                      |
| `PROVEEDOR_TELEFONO`      | —           | Tu WhatsApp con código de país, ej. `51987654321`              |
| `DEMO_DIAS_DE_PRUEBA`     | —           | `15`                                                           |
| `APIS_NET_PE_TOKEN`       | —           | Opcional: sin él, la búsqueda por DNI/RUC degrada con un aviso |

Generar los secretos JWT (nunca reutilizar los de desarrollo):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

El frontend solo necesita una, **en tiempo de compilación** (Vite la incrusta en el bundle;
cambiarla exige volver a compilar):

| Variable       | Valor                                                      |
| -------------- | ---------------------------------------------------------- |
| `VITE_API_URL` | URL del backend, ej. `https://restaurant-api.onrender.com` |

---

## 3. Base de datos (PostgreSQL)

Requisitos: **PostgreSQL 13 o superior** (se usan `FORCE ROW LEVEL SECURITY`, `gen_random_uuid()`
y `FILTER` en agregados) y permiso para **crear roles**.

| Servicio              | Plan gratuito                             | `CREATE ROLE`     | Notas                                                               |
| --------------------- | ----------------------------------------- | ----------------- | ------------------------------------------------------------------- |
| **Neon**              | Sí, generoso; se suspende por inactividad | Sí                | Serverless. El primer acceso tras la suspensión tarda unos segundos |
| **Supabase**          | Sí; se pausa a los 7 días sin uso         | Sí                | Trae panel SQL y copias de seguridad                                |
| **Railway**           | Crédito de prueba, luego de pago          | Sí (superusuario) | Lo más simple si backend y base van juntos                          |
| **Render PostgreSQL** | Gratuito **caduca a los 30 días**         | Sí                | El plan de pago arranca en ~7 USD/mes                               |
| **Aiven**             | Plan libre limitado                       | Sí                |                                                                     |
| **RDS / Cloud SQL**   | No                                        | Sí                | Para cuando haya volumen real                                       |

**Recomendación para empezar: Neon** (gratis, no caduca, permite crear roles). Para producción
seria con clientes que pagan: **Supabase Pro o Railway**, por las copias de seguridad
automáticas.

### Pasos

1. Crear el proyecto/instancia y copiar la cadena de conexión.
2. Traducirla a las variables: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.
3. Elegir una contraseña para el rol de la aplicación y ponerla en `DB_APP_PASSWORD`. **No
   hace falta crear el rol a mano**: lo crea la migración.
4. Ejecutar las migraciones (sección 4, paso 3).
5. **Verificar que el aislamiento quedó activo** — este paso no es opcional:

   ```sql
   -- Debe devolver 32 filas, todas con rowsecurity y forcerowsecurity en true
   SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relrowsecurity;

   -- El rol de la aplicación NO debe ser superusuario ni tener bypassrls
   SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'restaurant_erp_app';
   ```

   Si `rolsuper` o `rolbypassrls` salen en `true`, **detente**: el aislamiento no está
   funcionando y los datos de unos clientes son visibles para otros.

### Migraciones y RLS: regla permanente

Toda migración futura que **lea o escriba datos** de una tabla bajo RLS tiene que llamar
primero a `activarBypassRls(queryRunner)` (`src/database/bypass-rls.ts`). El DDL puro (crear
columnas, índices, tipos) no lo necesita.

En desarrollo esto pasa desapercibido porque el rol de migraciones de Docker es superusuario;
en un Postgres gestionado, donde el rol suele ser dueño **sin** ser superusuario,
`FORCE ROW LEVEL SECURITY` sí lo alcanza y un `UPDATE` sin bypass afecta cero filas **en
silencio**.

---

## 4. Backend (Node + Express)

| Servicio    | Plan gratuito                                   | Disco persistente    | Notas                                        |
| ----------- | ----------------------------------------------- | -------------------- | -------------------------------------------- |
| **Render**  | Sí, pero **se duerme** tras 15 min sin tráfico  | Solo en plan de pago | El primer acceso tras dormirse tarda ~50 s   |
| **Railway** | Crédito de prueba, luego ~5 USD/mes             | Sí (volúmenes)       | Base y backend en un mismo proyecto          |
| **Fly.io**  | Capa gratuita limitada                          | Sí (volúmenes)       | Requiere manejar `fly.toml`                  |
| **Koyeb**   | Sí                                              | No                   |                                              |
| **VPS**     | No (~5 USD/mes: Hetzner, DigitalOcean, Contabo) | Sí                   | Control total; exige administrar el servidor |

**Recomendación:** Railway o un VPS si las fotos importan (disco persistente incluido);
Render gratis solo para enseñar el sistema, nunca para un cliente real — 50 segundos de
espera en el primer pedido del día no es aceptable en un restaurante.

### Opción A: imagen Docker (VPS, Fly.io, cualquier proveedor con contenedores)

Hay un `Dockerfile` listo, que se construye **desde la raíz** del monorepo:

```bash
docker build -f apps/backend/Dockerfile -t restaurant-erp-backend .
```

Dos etapas: compila con las dependencias completas y la imagen final lleva solo lo necesario
para ejecutar, corriendo como el usuario `node` sin privilegios. Monta un volumen en
`/app/apps/backend/uploads` para que las fotos sobrevivan a los despliegues (sección 1.2).

### Opción B: construcción nativa del proveedor (Render, Railway)

Es un monorepo pnpm, así que los comandos se ejecutan desde la **raíz**:

- **Build:** `pnpm install --frozen-lockfile && pnpm --filter @restaurant-erp/backend build`
- **Start:** `pnpm --filter @restaurant-erp/backend start`
- **Health check:** `/health/listo` (comprueba también la base; `/health` solo dice si el proceso vive)
- **Node:** 22 o superior

### Pasos

1. Conectar el repositorio y elegir la rama.
2. Cargar **todas** las variables de la sección 2.
3. Ejecutar las migraciones una vez, con las credenciales del rol dueño:

   ```bash
   pnpm --filter @restaurant-erp/backend migration:run
   ```

   Desde la consola del proveedor, o en local apuntando `DB_HOST` a la base remota. **No lo
   pongas en el comando de arranque**: si el servicio escala a dos instancias, dos
   migraciones simultáneas sobre la misma base es la forma más rápida de corromperla.

4. Verificar: `curl https://TU-BACKEND/health` debe responder `{"success":true,...}`.
5. Comprobar el usuario de arranque y cambiarle la contraseña de inmediato
   (`admin@restaurant.local` / `CambiarInmediatamente123!`, ver `autenticacion.md`).
6. Marcar tu cuenta como proveedor del sistema, si `PROVEEDOR_EMAIL` no coincidía con ningún
   usuario existente al migrar:

   ```sql
   UPDATE usuarios SET es_proveedor = false;
   UPDATE usuarios SET es_proveedor = true WHERE email = 'tu-correo@ejemplo.com';
   ```

7. Si el plan tiene disco persistente, montarlo en `apps/backend/uploads`.

---

## 5. Frontend (React + Vite)

Compila a archivos estáticos: cualquier CDN sirve, y las capas gratuitas son holgadas.

| Servicio             | Plan gratuito  | Notas                                |
| -------------------- | -------------- | ------------------------------------ |
| **Vercel**           | Sí, amplio     | Lo más directo                       |
| **Netlify**          | Sí, amplio     | Equivalente                          |
| **Cloudflare Pages** | Sí, muy amplio | El más generoso en ancho de banda    |
| **Render Static**    | Sí             | Útil si el backend ya está en Render |

### Configuración

- **Build:** `pnpm install --frozen-lockfile && pnpm --filter @restaurant-erp/frontend build`
- **Directorio de salida:** `apps/frontend/dist`
- **Variable:** `VITE_API_URL` = URL del backend

### Reescritura para SPA — imprescindible

La aplicación usa rutas del lado del cliente (`/carta/:slug`, `/registro`, `/plataforma`). Sin
reescritura, **entrar directamente a una URL o recargar da 404** — y el caso más visible es
justo el peor: el enlace de la carta que el restaurante comparte por WhatsApp.

- **Vercel** — `vercel.json` en la raíz:

  ```json
  { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
  ```

- **Netlify** — `apps/frontend/public/_redirects`:

  ```
  /*  /index.html  200
  ```

- **Cloudflare Pages** — `apps/frontend/public/_redirects`, mismo contenido.
- **Render Static** — regla de reescritura `/*` → `/index.html` en el panel.

---

## 6. Orden de despliegue y verificación

El orden importa: cada paso necesita la URL del anterior.

1. **Base de datos** → obtener credenciales.
2. **Backend** → configurar variables (con `CORS_ORIGIN` provisional), desplegar, migrar.
3. **Frontend** → configurar `VITE_API_URL` con la URL real del backend, desplegar.
4. **Volver al backend** → corregir `CORS_ORIGIN` con la URL real del frontend y
   `COOKIE_CROSS_SITE=true` si están en dominios distintos. Redesplegar.

### Lista de verificación

| #   | Qué comprobar                       | Cómo                                          | Si falla                                        |
| --- | ----------------------------------- | --------------------------------------------- | ----------------------------------------------- |
| 1   | Backend vivo                        | `curl https://API/health`                     | Revisar logs y variables obligatorias           |
| 2   | Base migrada                        | `migration:show` sin pendientes               | Ejecutar migraciones                            |
| 3   | **Aislamiento activo**              | Las dos consultas de la sección 3.5           | **No abrir al público hasta arreglarlo**        |
| 4   | Login                               | Entrar con el usuario de arranque             | Revisar `CORS_ORIGIN` (exacto, sin barra final) |
| 5   | **La sesión sobrevive un refresco** | Iniciar sesión y pulsar F5                    | Falta `COOKIE_CROSS_SITE=true`                  |
| 6   | Registro público                    | Crear una demo en `/registro`                 | Revisar el límite de 5/hora y los logs          |
| 7   | Aislamiento visible                 | Esa demo no debe ver datos de la otra empresa | Ver #3                                          |
| 8   | Carta pública                       | Abrir `/carta/SLUG` en una ventana privada    | Falta la reescritura SPA (sección 5)            |
| 9   | Fotos tras un redespliegue          | Subir una foto, redesplegar, recargar         | Falta disco persistente (sección 1.2)           |

---

## 7. Costo estimado mensual

| Escenario                   | Base                 | Backend         | Frontend    | Total       |
| --------------------------- | -------------------- | --------------- | ----------- | ----------- |
| **Demostración**            | Neon free            | Render free     | Vercel free | **0 USD**   |
| **Primeros clientes**       | Neon free / Supabase | Railway ~5      | Vercel free | **~5 USD**  |
| **Producción con clientes** | Supabase Pro ~25     | Railway ~10     | Vercel free | **~35 USD** |
| **VPS todo en uno**         | Postgres en el VPS   | Hetzner CX22 ~5 | Vercel free | **~5 USD**  |

El escenario "Demostración" sirve para enseñar el sistema, no para operar un restaurante: el
backend se duerme y las fotos se pierden en cada despliegue.

---

## 8. Pendiente antes de cobrar por esto

Trabajo real que este documento no resuelve porque exige código o decisiones que aún no se
tomaron:

- **Copias de seguridad programadas.** El script `./scripts/respaldo-bd.sh` ya crea y
  **verifica restaurando** (comprueba que las políticas RLS viajen dentro del volcado). Falta
  programarlo: los planes de pago de Neon/Supabase/Railway lo hacen solos, pero conviene
  guardar además una copia propia fuera del proveedor.
- **Fotos en almacenamiento de objetos** si se quiere escalar a más de una instancia
  (sección 1.2, opción 2). No implementado.
- **Pruebas del frontend.** El backend ya tiene 40 pruebas integrales (FASE 22,
  `pnpm --filter @restaurant-erp/backend test`), pero el frontend no tiene ninguna. Antes de
  desplegar con frecuencia conviene cubrir al menos el flujo de login y la carta pública.
- **Envío de registros a un servicio externo.** La aplicación ya emite una línea JSON por
  evento con identificador de traza (`utils/logger.ts`), que cualquier panel de hosting sabe
  leer. Lo que falta es retenerlos más allá del reinicio del contenedor: ahí entra Sentry,
  Better Stack o el propio agregador del proveedor.
- **Rotación de los secretos JWT** y procedimiento para invalidar sesiones si uno se filtra.
