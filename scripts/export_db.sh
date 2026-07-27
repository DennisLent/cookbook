#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
# shellcheck source=scripts/lib/compose.sh
source "${ROOT_DIR}/scripts/lib/compose.sh"
ENV_FILE="${ENV_FILE_PATH}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

DATABASE_ENGINE="${DATABASE_ENGINE:-postgres}"
OUTPUT_PATH="${1:-}"

if [[ "${DATABASE_ENGINE}" == "sqlite" ]]; then
  SOURCE_DB="${BACKEND_DIR}/db.sqlite3"
  TARGET_PATH="${OUTPUT_PATH:-${ROOT_DIR}/backups/cookbook-${TIMESTAMP}.sqlite3}"
  mkdir -p "$(dirname "${TARGET_PATH}")"

  if [[ ! -f "${SOURCE_DB}" ]]; then
    echo "[export] SQLite database not found at ${SOURCE_DB}" >&2
    exit 1
  fi

  cp "${SOURCE_DB}" "${TARGET_PATH}"
  echo "[export] SQLite backup written to ${TARGET_PATH}"
  exit 0
fi

TARGET_PATH="${OUTPUT_PATH:-${ROOT_DIR}/backups/cookbook-${TIMESTAMP}.sql}"
mkdir -p "$(dirname "${TARGET_PATH}")"

compose_run exec -T db pg_dump \
  -U "${POSTGRES_USER:-cookbook}" \
  -d "${POSTGRES_DB:-cookbook}" \
  --no-owner \
  --no-privileges \
  > "${TARGET_PATH}"

echo "[export] PostgreSQL backup written to ${TARGET_PATH}"
