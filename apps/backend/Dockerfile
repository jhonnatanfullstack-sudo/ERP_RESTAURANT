# Imagen del backend. Se construye desde la RAÍZ del monorepo, no desde esta carpeta:
#   docker build -f apps/backend/Dockerfile -t restaurant-erp-backend .
# El backend depende del lockfile y del workspace de pnpm, que viven en la raíz.

# --- Etapa 1: dependencias y compilación -------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable
# Sin TTY (cualquier build de CI/PaaS, incluido este), pnpm reciente se niega a purgar
# `node_modules` al reinstalar solo con dependencias de producción más abajo
# (ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY) — CI=true es la señal que pnpm reconoce para
# saltar esa confirmación interactiva. Solo aplica a esta etapa, no a la imagen final.
ENV CI=true

# Primero los manifiestos: si no cambian, Docker reutiliza la capa de dependencias y una
# recompilación por un cambio de código no vuelve a descargar todo el árbol.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/backend/package.json apps/backend/
COPY packages/ packages/
RUN pnpm install --frozen-lockfile --filter @restaurant-erp/backend...

COPY apps/backend/ apps/backend/
RUN pnpm --filter @restaurant-erp/backend build

# Se reinstala solo con dependencias de producción: TypeScript, Vitest y los @types no tienen
# nada que hacer en la imagen final.
RUN pnpm install --frozen-lockfile --prod --filter @restaurant-erp/backend...

# --- Etapa 2: imagen final ---------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# `node` es un usuario sin privilegios que ya trae la imagen oficial. Correr como root dentro
# del contenedor convierte cualquier ejecución de código en un compromiso del contenedor
# entero.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=build --chown=node:node /app/apps/backend/dist ./apps/backend/dist
COPY --from=build --chown=node:node /app/apps/backend/package.json ./apps/backend/

# Punto de montaje del disco persistente. Sin un volumen montado aquí, las fotos de los
# productos se pierden en cada despliegue (ver docs/despliegue.md, sección 1.2). Se deja la
# carpeta creada con los permisos correctos, pero sin la instrucción `VOLUME`: Railway
# rechaza el build si la imagen la declara ("use Railway Volumes" — el volumen se monta desde
# su panel, no desde la imagen). No hace falta para que un volumen real funcione acá: en
# Railway, Fly.io o un VPS con `docker run -v`, montar algo en esta ruta sigue funcionando
# igual, con o sin esta instrucción — es solo documentación para quien corra la imagen con
# `docker run` a secas, y ese caso no es el de este proyecto.
RUN mkdir -p /app/apps/backend/uploads && chown -R node:node /app/apps/backend/uploads

USER node
EXPOSE 4000

# El health check del orquestador debe apuntar a /health/listo, que además comprueba la base.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health/listo').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Las migraciones NO se ejecutan aquí a propósito: con dos instancias, dos migraciones
# simultáneas sobre la misma base es la forma más rápida de corromperla. Se lanzan una vez,
# aparte (ver docs/despliegue.md, sección 4).
CMD ["node", "apps/backend/dist/server.js"]
