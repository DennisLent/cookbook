#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
# shellcheck source=scripts/lib/compose.sh
source "${ROOT_DIR}/scripts/lib/compose.sh"
ENV_FILE="${ENV_FILE_PATH}"

if [[ $# -lt 1 ]]; then
  echo "Usage: ./scripts/import_db.sh <backup-file>" >&2
  exit 1
fi

INPUT_PATH="$1"
if [[ ! -f "${INPUT_PATH}" ]]; then
  echo "[import] Backup file not found: ${INPUT_PATH}" >&2
  exit 1
fi

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

DATABASE_ENGINE="${DATABASE_ENGINE:-postgres}"

if [[ "${DATABASE_ENGINE}" == "sqlite" ]]; then
  TARGET_DB="${BACKEND_DIR}/db.sqlite3"
  cp "${INPUT_PATH}" "${TARGET_DB}"
  echo "[import] SQLite database restored to ${TARGET_DB}"
  exit 0
fi

compose_run exec -T db psql \
  -U "${POSTGRES_USER:-cookbook}" \
  -d "${POSTGRES_DB:-cookbook}" \
  -v ON_ERROR_STOP=1 \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" \
  >/dev/null

compose_run exec -T db psql \
  -U "${POSTGRES_USER:-cookbook}" \
  -d "${POSTGRES_DB:-cookbook}" \
  -v ON_ERROR_STOP=1 \
  < "${INPUT_PATH}" \
  >/dev/null

echo "[import] PostgreSQL backup restored from ${INPUT_PATH}"
