#!/usr/bin/env bash
#
# Respaldo de la base de datos.
#
#   ./scripts/respaldo-bd.sh crear                -> volcado comprimido con fecha en respaldos/
#   ./scripts/respaldo-bd.sh verificar <archivo>  -> lo restaura en una base temporal y la borra
#
# Un respaldo que nunca se restauró no es un respaldo: por eso `verificar` no es opcional en
# el procedimiento, y comprueba además que las políticas de aislamiento entre empresas hayan
# viajado dentro del volcado. Sin ellas, una restauración dejaría el sistema funcionando pero
# con los datos de todos los clientes visibles entre sí, y eso no se nota a simple vista.
#
# Funciona con las herramientas de Postgres instaladas localmente o, si no están, a través
# del contenedor de Docker. En Windows lo habitual es lo segundo.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESTINO="${RAIZ}/respaldos"
CONTENEDOR="${DB_CONTAINER:-restaurant_erp_postgres}"

# Se leen solo las variables necesarias en vez de `source .env`: ese archivo tiene valores con
# espacios (PROVEEDOR_NOMBRE=Jhonnatan Vasquez) que el intérprete tomaría como un comando.
leer_env() {
  local clave="$1"
  sed -n "s/^${clave}=//p" "${RAIZ}/.env" | head -1 | tr -d '\r'
}

DB_HOST="$(leer_env DB_HOST)"
DB_PORT="$(leer_env DB_PORT)"
DB_NAME="$(leer_env DB_NAME)"
# El rol dueño: es el único que puede volcar y restaurar el esquema completo, políticas
# incluidas. El rol de la aplicación está sujeto a RLS y traería un volcado a medias.
DB_USER="$(leer_env DB_USER)"
DB_PASSWORD="$(leer_env DB_PASSWORD)"

if command -v pg_dump >/dev/null 2>&1; then
  MODO="local"
else
  MODO="docker"
  if ! docker inspect "${CONTENEDOR}" >/dev/null 2>&1; then
    echo "ERROR: no hay herramientas de Postgres en el PATH ni el contenedor '${CONTENEDOR}'." >&2
    echo "Instala el cliente de PostgreSQL o levanta Docker (docker compose up -d)." >&2
    exit 1
  fi
fi

# Ejecuta una herramienta de Postgres, localmente o dentro del contenedor. En modo Docker el
# host y el puerto son los internos del contenedor, no los publicados en la máquina.
pg() {
  local herramienta="$1"; shift
  if [ "${MODO}" = "local" ]; then
    PGPASSWORD="${DB_PASSWORD}" "${herramienta}" \
      --host "${DB_HOST}" --port "${DB_PORT}" --username "${DB_USER}" "$@"
  else
    docker exec -i -e PGPASSWORD="${DB_PASSWORD}" "${CONTENEDOR}" \
      "${herramienta}" --username "${DB_USER}" "$@"
  fi
}

crear() {
  mkdir -p "${DESTINO}"
  local archivo="${DESTINO}/${DB_NAME}-$(date +%Y%m%d-%H%M%S).dump"

  # Formato `custom` (-Fc): comprimido y restaurable de forma selectiva, a diferencia del SQL
  # plano. `--no-owner` evita que restaurar exija que existan exactamente los mismos roles.
  pg pg_dump --dbname "${DB_NAME}" --format=custom --no-owner > "${archivo}"

  if [ ! -s "${archivo}" ]; then
    echo "ERROR: el volcado salió vacío." >&2
    rm -f "${archivo}"
    exit 1
  fi

  echo "Respaldo creado: ${archivo} ($(du -h "${archivo}" | cut -f1))"
  echo "Verifícalo ahora: ./scripts/respaldo-bd.sh verificar ${archivo}"
}

verificar() {
  local archivo="${1:?Indica el archivo de respaldo a verificar}"
  [ -s "${archivo}" ] || { echo "ERROR: '${archivo}' no existe o está vacío." >&2; exit 1; }

  local temporal="verificacion_respaldo_$$"
  echo "Restaurando en la base temporal ${temporal}..."

  pg createdb "${temporal}"
  # Sin esto, un fallo a mitad de la restauración dejaría la base temporal colgando. Las
  # comillas dobles expanden el nombre AHORA: con comillas simples se expandiría al salir,
  # cuando la variable local de la función ya no existe y `set -u` aborta el propio trap.
  trap "pg dropdb --if-exists '${temporal}' >/dev/null 2>&1 || true" EXIT

  pg pg_restore --dbname "${temporal}" --no-owner < "${archivo}"

  local consulta_tablas="SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"
  local consulta_politicas="SELECT count(*) FROM pg_policies WHERE schemaname='public'"

  local tablas politicas
  tablas=$(pg psql --dbname "${temporal}" --tuples-only --no-align --command "${consulta_tablas}" | tr -d '\r')
  politicas=$(pg psql --dbname "${temporal}" --tuples-only --no-align --command "${consulta_politicas}" | tr -d '\r')

  echo "Tablas restauradas: ${tablas}"
  echo "Políticas RLS:      ${politicas}"

  if [ "${politicas}" -lt 30 ]; then
    echo "ERROR: el respaldo no trae las políticas de aislamiento entre empresas." >&2
    exit 1
  fi
  echo "Respaldo verificado correctamente."
}

case "${1:-}" in
  crear) crear ;;
  verificar) verificar "${2:-}" ;;
  *) echo "Uso: $0 {crear|verificar <archivo>}" >&2; exit 1 ;;
esac
