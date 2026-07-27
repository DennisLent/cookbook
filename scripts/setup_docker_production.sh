#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE_DEFAULT="${ROOT_DIR}/.env.production"
DOCKER_DATA_DIR="${ROOT_DIR}/docker-data"
BOOTSTRAP_DIR="${DOCKER_DATA_DIR}/bootstrap"
VOSK_DIR="${DOCKER_DATA_DIR}/vosk"
IMPORT_COOKIES_DIR="${DOCKER_DATA_DIR}/import-cookies"
DEFAULT_VOSK_URL="https://alphacephei.com/vosk/models/vosk-model-en-us-0.22-lgraph.zip"

prompt_value() {
  local prompt="$1"
  local default_value="${2:-}"
  local value
  if [[ -n "${default_value}" ]]; then
    read -r -p "${prompt} [${default_value}]: " value
    printf '%s\n' "${value:-$default_value}"
  else
    read -r -p "${prompt}: " value
    printf '%s\n' "${value}"
  fi
}

prompt_secret() {
  local prompt="$1"
  local value
  read -r -s -p "${prompt}: " value
  printf '\n' >&2
  printf '%s\n' "${value}"
}

prompt_yes_no() {
  local prompt="$1"
  local default_value="${2:-y}"
  local suffix="[Y/n]"
  if [[ "${default_value}" == "n" ]]; then
    suffix="[y/N]"
  fi

  while true; do
    read -r -p "${prompt} ${suffix}: " value
    value="${value:-$default_value}"
    case "${value,,}" in
      y|yes) return 0 ;;
      n|no) return 1 ;;
    esac
    echo "Please answer y or n."
  done
}

generate_secret_key() {
  python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(50))
PY
}

extract_host_from_url() {
  python3 - "$1" <<'PY'
import sys
from urllib.parse import urlparse

url = sys.argv[1].strip()
parsed = urlparse(url if "://" in url else f"https://{url}")
print(parsed.hostname or "localhost")
PY
}

normalize_origin_url() {
  python3 - "$1" "${2:-https}" <<'PY'
import sys
from urllib.parse import urlparse

raw = sys.argv[1].strip()
default_scheme = sys.argv[2].strip() or "https"
candidate = raw if "://" in raw else f"{default_scheme}://{raw}"
parsed = urlparse(candidate)

if parsed.scheme not in {"http", "https"} or not parsed.netloc or not parsed.hostname:
    raise SystemExit(1)

print(f"{parsed.scheme}://{parsed.netloc}")
PY
}

download_vosk_model() {
  local source="$1"
  rm -rf "${VOSK_DIR}"
  mkdir -p "${VOSK_DIR}"

  if [[ -d "${source}" ]]; then
    cp -R "${source}/." "${VOSK_DIR}/"
    return 0
  fi

  local tmp_zip="${DOCKER_DATA_DIR}/vosk-model.zip"
  curl -L "${source}" -o "${tmp_zip}"
  unzip -q "${tmp_zip}" -d "${DOCKER_DATA_DIR}/vosk-download"
  rm -f "${tmp_zip}"

  local extracted_dir
  extracted_dir="$(find "${DOCKER_DATA_DIR}/vosk-download" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  if [[ -z "${extracted_dir}" ]]; then
    echo "Failed to extract a Vosk model from ${source}" >&2
    exit 1
  fi

  cp -R "${extracted_dir}/." "${VOSK_DIR}/"
  rm -rf "${DOCKER_DATA_DIR}/vosk-download"
}

write_env_file() {
  cat > "${ENV_FILE_PATH}" <<EOF
APP_NAME=emma-cookbook
APP_VERSION=${EMMA_VERSION}
APP_GIT_SHA=
SECRET_KEY=${SECRET_KEY}
DEBUG=False
ALLOWED_HOSTS=${ALLOWED_HOSTS}
CORS_ALLOWED_ORIGINS=${PUBLIC_APP_URL}

EMMA_VERSION=${EMMA_VERSION}
EMMA_GIT_SHA=
EMMA_BACKEND_IMAGE=${EMMA_BACKEND_IMAGE}
EMMA_FRONTEND_IMAGE=${EMMA_FRONTEND_IMAGE}
APP_UPDATE_CHECK_ENABLED=${APP_UPDATE_CHECK_ENABLED}
APP_UPDATE_REPOSITORY=${APP_UPDATE_REPOSITORY}
APP_UPDATE_CHECK_TIMEOUT_SECONDS=10
APP_UPDATE_CHECK_TAG_LIMIT=25
APP_UPDATE_CHECK_SCHEDULE_HOUR=3
APP_UPDATE_CHECK_SCHEDULE_MINUTE=0

DATABASE_ENGINE=postgres
POSTGRES_DB=${POSTGRES_DB}
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_HOST=db
POSTGRES_PORT=5432

APP_MODE=${APP_MODE}
AUTH_PROVIDER=${AUTH_PROVIDER}
KEYCLOAK_REALM=${KEYCLOAK_REALM}
KEYCLOAK_URL=${KEYCLOAK_URL}
KEYCLOAK_ISSUER=${KEYCLOAK_ISSUER}
KEYCLOAK_CLIENT_ID=${KEYCLOAK_CLIENT_ID}
KEYCLOAK_AUDIENCE=${KEYCLOAK_AUDIENCE}
KEYCLOAK_JWKS_URL=${KEYCLOAK_JWKS_URL}
KEYCLOAK_ADMIN_ROLE=${KEYCLOAK_ADMIN_ROLE}

DJANGO_SUPERUSER_USERNAME=${DJANGO_SUPERUSER_USERNAME}
DJANGO_SUPERUSER_PASSWORD=${DJANGO_SUPERUSER_PASSWORD}

SEED_INTERNAL_DATA=0

CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0
CELERY_TASK_TIME_LIMIT=900
CELERY_TASK_SOFT_TIME_LIMIT=840

RECIPE_IMPORT_JOBS_RATE_LIMIT=1200/hour
RECIPE_IMPORT_MAX_FILESIZE_BYTES=104857600
RECIPE_IMPORT_DOWNLOAD_TIMEOUT_SECONDS=180
RECIPE_IMPORT_ALLOWED_HOSTS=instagram.com,www.instagram.com,m.instagram.com,tiktok.com,www.tiktok.com,m.tiktok.com,vm.tiktok.com,youtube.com,www.youtube.com,m.youtube.com,youtu.be
RECIPE_IMPORT_COOKIE_FILE=/app/import-cookies/cookies.txt

USE_S3_MEDIA_STORAGE=False
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_STORAGE_BUCKET_NAME=
AWS_S3_REGION_NAME=
AWS_S3_ENDPOINT_URL=
AWS_S3_CUSTOM_DOMAIN=

VOSK_MODEL_PATH=/app/vosk-model
OLLAMA_DEFAULT_MODEL=${OLLAMA_DEFAULT_MODEL}
OLLAMA_HOST=${OLLAMA_HOST}
PUBLIC_HOST=${PUBLIC_HOST}
FRONTEND_HTTP_BIND=${FRONTEND_HTTP_BIND}
EOF
}

usage() {
  cat <<'EOF'
Usage: ./scripts/setup_docker_production.sh [options]

  --app-mode single_user|multi_user
  --public-url URL
  --proxy direct|bundled|external
  --frontend-bind HOST:PORT
  --ollama container|external
  --vosk default|PATH|URL
  --source registry|local
  --version TAG
  --env-file PATH
  --seed-data
  --import PATH
  --admin-username USER
  --admin-password PASSWORD
  --auth-provider jwt|keycloak
  --allow-existing
  --non-interactive
EOF
}

APP_MODE=""
PUBLIC_APP_URL_INPUT=""
PROXY_MODE=""
FRONTEND_HTTP_BIND=""
OLLAMA_MODE=""
VOSK_SOURCE=""
IMAGE_SOURCE=""
EMMA_VERSION=""
ENV_FILE_PATH=""
SEED_DATA=-1
IMPORT_PATH=""
DJANGO_SUPERUSER_USERNAME=""
DJANGO_SUPERUSER_PASSWORD=""
AUTH_PROVIDER=""
ALLOW_EXISTING=0
NON_INTERACTIVE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-mode) APP_MODE="$2"; shift 2 ;;
    --public-url) PUBLIC_APP_URL_INPUT="$2"; shift 2 ;;
    --proxy) PROXY_MODE="$2"; shift 2 ;;
    --frontend-bind) FRONTEND_HTTP_BIND="$2"; shift 2 ;;
    --ollama) OLLAMA_MODE="$2"; shift 2 ;;
    --vosk) VOSK_SOURCE="$2"; shift 2 ;;
    --source) IMAGE_SOURCE="$2"; shift 2 ;;
    --version) EMMA_VERSION="$2"; shift 2 ;;
    --env-file) ENV_FILE_PATH="$2"; shift 2 ;;
    --seed-data) SEED_DATA=1; shift ;;
    --import) IMPORT_PATH="$2"; shift 2 ;;
    --admin-username) DJANGO_SUPERUSER_USERNAME="$2"; shift 2 ;;
    --admin-password) DJANGO_SUPERUSER_PASSWORD="$2"; shift 2 ;;
    --auth-provider) AUTH_PROVIDER="$2"; shift 2 ;;
    --allow-existing) ALLOW_EXISTING=1; shift ;;
    --non-interactive) NON_INTERACTIVE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

echo "Cookbook Docker production setup"

if [[ "${NON_INTERACTIVE}" -eq 0 ]]; then
  ENV_FILE_PATH="${ENV_FILE_PATH:-$(prompt_value "Environment file path" "${ENV_FILE_DEFAULT}")}"
  PUBLIC_APP_URL_INPUT="${PUBLIC_APP_URL_INPUT:-$(prompt_value "Public app URL" "http://localhost")}"
  PROXY_MODE="${PROXY_MODE:-$(prompt_value "Proxy mode (direct/bundled/external)" "direct")}"
  case "${PROXY_MODE}" in
    direct) FRONTEND_HTTP_BIND="${FRONTEND_HTTP_BIND:-$(prompt_value "Frontend binding" "0.0.0.0:80")}" ;;
    bundled) FRONTEND_HTTP_BIND="${FRONTEND_HTTP_BIND:-$(prompt_value "Frontend binding" "127.0.0.1:8080")}" ;;
    external) FRONTEND_HTTP_BIND="${FRONTEND_HTTP_BIND:-$(prompt_value "Frontend binding" "127.0.0.1:8082")}" ;;
  esac
  EMMA_VERSION="${EMMA_VERSION:-$(prompt_value "emma-cookbook version tag" "latest")}"
  IMAGE_SOURCE="${IMAGE_SOURCE:-$(prompt_value "Image source (registry/local)" "registry")}"
  APP_MODE="${APP_MODE:-$(prompt_value "Application mode (multi_user/single_user)" "multi_user")}"
  AUTH_PROVIDER="${AUTH_PROVIDER:-jwt}"
  if [[ "${APP_MODE}" == "multi_user" ]]; then
    DJANGO_SUPERUSER_USERNAME="${DJANGO_SUPERUSER_USERNAME:-$(prompt_value "Django admin username" "admin")}"
    DJANGO_SUPERUSER_PASSWORD="${DJANGO_SUPERUSER_PASSWORD:-$(prompt_secret "Django admin password")}"
    AUTH_PROVIDER="$(prompt_value "Auth provider (jwt/keycloak)" "${AUTH_PROVIDER}")"
  fi
  if [[ -z "${IMPORT_PATH}" ]] && prompt_yes_no "Load an existing database backup?" "n"; then
    IMPORT_PATH="$(prompt_value "Path to existing backup (.sql or .json)")"
  fi
  if [[ "${SEED_DATA}" -lt 0 ]]; then
    SEED_DATA=0
    if [[ -z "${IMPORT_PATH}" ]] && prompt_yes_no "Seed recipe data into the new database?" "n"; then
      SEED_DATA=1
    fi
  fi
  OLLAMA_MODE="${OLLAMA_MODE:-$(prompt_value "Ollama mode (container/external)" "container")}"
  VOSK_SOURCE="${VOSK_SOURCE:-$(prompt_value "Vosk model source (default/path/URL)" "default")}"
else
  ENV_FILE_PATH="${ENV_FILE_PATH:-${ENV_FILE_DEFAULT}}"
  PUBLIC_APP_URL_INPUT="${PUBLIC_APP_URL_INPUT:-http://localhost}"
  PROXY_MODE="${PROXY_MODE:-direct}"
  case "${PROXY_MODE}" in
    direct) FRONTEND_HTTP_BIND="${FRONTEND_HTTP_BIND:-0.0.0.0:80}" ;;
    bundled) FRONTEND_HTTP_BIND="${FRONTEND_HTTP_BIND:-127.0.0.1:8080}" ;;
    external) FRONTEND_HTTP_BIND="${FRONTEND_HTTP_BIND:-127.0.0.1:8082}" ;;
  esac
  EMMA_VERSION="${EMMA_VERSION:-latest}"
  IMAGE_SOURCE="${IMAGE_SOURCE:-registry}"
  APP_MODE="${APP_MODE:-multi_user}"
  AUTH_PROVIDER="${AUTH_PROVIDER:-jwt}"
  SEED_DATA="$([[ "${SEED_DATA}" -lt 0 ]] && echo 0 || echo "${SEED_DATA}")"
  OLLAMA_MODE="${OLLAMA_MODE:-container}"
  VOSK_SOURCE="${VOSK_SOURCE:-default}"
fi

case "${APP_MODE}" in single_user|multi_user) ;; *) echo "Invalid app mode: ${APP_MODE}" >&2; exit 2 ;; esac
case "${PROXY_MODE}" in direct|bundled|external) ;; *) echo "Invalid proxy mode: ${PROXY_MODE}" >&2; exit 2 ;; esac
case "${OLLAMA_MODE}" in container|external) ;; *) echo "Invalid Ollama mode: ${OLLAMA_MODE}" >&2; exit 2 ;; esac
case "${IMAGE_SOURCE}" in registry|local) ;; *) echo "Invalid image source: ${IMAGE_SOURCE}" >&2; exit 2 ;; esac
case "${AUTH_PROVIDER}" in jwt|keycloak) ;; *) echo "Invalid auth provider: ${AUTH_PROVIDER}" >&2; exit 2 ;; esac
if [[ "${FRONTEND_HTTP_BIND}" != *:* ]]; then
  if [[ "${PROXY_MODE}" == "direct" ]]; then
    FRONTEND_HTTP_BIND="0.0.0.0:${FRONTEND_HTTP_BIND}"
  else
    FRONTEND_HTTP_BIND="127.0.0.1:${FRONTEND_HTTP_BIND}"
  fi
fi
FRONTEND_PORT="${FRONTEND_HTTP_BIND##*:}"
if [[ ! "${FRONTEND_PORT}" =~ ^[0-9]+$ ]]; then
  echo "Invalid frontend binding: ${FRONTEND_HTTP_BIND}" >&2
  exit 2
fi
FRONTEND_PORT_NUMBER=$((10#${FRONTEND_PORT}))
if (( FRONTEND_PORT_NUMBER < 1 || FRONTEND_PORT_NUMBER > 65535 )); then
  echo "Invalid frontend binding: ${FRONTEND_HTTP_BIND}" >&2
  exit 2
fi
if [[ "${APP_MODE}" == "multi_user" && "${AUTH_PROVIDER}" == "jwt" ]]; then
  if [[ -z "${DJANGO_SUPERUSER_USERNAME}" || -z "${DJANGO_SUPERUSER_PASSWORD}" ]]; then
    echo "Multi-user JWT mode requires --admin-username and --admin-password." >&2
    exit 2
  fi
fi
if [[ -n "${IMPORT_PATH}" && ! -f "${IMPORT_PATH}" ]]; then
  echo "Backup file not found: ${IMPORT_PATH}" >&2
  exit 1
fi

PUBLIC_APP_URL="$(normalize_origin_url "${PUBLIC_APP_URL_INPUT}" "https")"
PUBLIC_HOST="$(extract_host_from_url "${PUBLIC_APP_URL}")"
ALLOWED_HOSTS="${PUBLIC_HOST},localhost,127.0.0.1,backend,frontend"
SECRET_KEY="$(generate_secret_key)"
POSTGRES_DB="cookbook"
POSTGRES_USER="cookbook"
POSTGRES_PASSWORD="$(generate_secret_key)"
DOCKERHUB_NAMESPACE="dennislent"
EMMA_BACKEND_IMAGE="${DOCKERHUB_NAMESPACE}/emma-cookbook-backend"
EMMA_FRONTEND_IMAGE="${DOCKERHUB_NAMESPACE}/emma-cookbook-frontend"
APP_UPDATE_REPOSITORY="DennisLent/emma-cookbook"
APP_UPDATE_CHECK_ENABLED="True"
KEYCLOAK_REALM="cookbook"
KEYCLOAK_URL="http://localhost:8080"
KEYCLOAK_CLIENT_ID="cookbook-web"
KEYCLOAK_AUDIENCE="cookbook-web"
KEYCLOAK_ADMIN_ROLE="cookbook-admin"
KEYCLOAK_ISSUER="${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}"
KEYCLOAK_JWKS_URL="${KEYCLOAK_ISSUER}/protocol/openid-connect/certs"
OLLAMA_DEFAULT_MODEL="llama3.2"
ENABLE_OLLAMA=0
OLLAMA_HOST="http://host.docker.internal:11434"
if [[ "${OLLAMA_MODE}" == "container" ]]; then
  ENABLE_OLLAMA=1
  OLLAMA_HOST="http://ollama:11434"
fi
if [[ "${VOSK_SOURCE}" == "default" ]]; then
  VOSK_SOURCE="${DEFAULT_VOSK_URL}"
fi

for required_command in docker curl unzip python3; do
  command -v "${required_command}" >/dev/null || {
    echo "Required command not found: ${required_command}" >&2
    exit 1
  }
done
docker info >/dev/null 2>&1 || {
  echo "Docker daemon is unavailable or this user cannot access it." >&2
  exit 1
}
docker compose version >/dev/null 2>&1 || {
  echo "Docker Compose v2 is required." >&2
  exit 1
}
if [[ ! -w "$(dirname "${ENV_FILE_PATH}")" ]]; then
  echo "Environment-file directory is not writable: $(dirname "${ENV_FILE_PATH}")" >&2
  exit 1
fi
AVAILABLE_KB="$(df -Pk "${ROOT_DIR}" | awk 'NR==2 {print $4}')"
if [[ "${AVAILABLE_KB}" -lt 2097152 ]]; then
  echo "At least 2 GiB of free disk space is required." >&2
  exit 1
fi
if [[ "${ALLOW_EXISTING}" -eq 0 ]] && {
  [[ -n "$(docker ps -aq --filter label=com.docker.compose.project=emma-cookbook)" ]] ||
  [[ -n "$(docker volume ls -q --filter label=com.docker.compose.project=emma-cookbook)" ]];
}; then
  echo "An emma-cookbook Compose deployment already exists. Refusing to overwrite it; use --allow-existing only when intentionally resuming setup." >&2
  exit 1
fi
if command -v ss >/dev/null && ss -H -ltn "sport = :${FRONTEND_PORT}" | grep -q .; then
  echo "Frontend port ${FRONTEND_PORT} is already in use." >&2
  exit 1
fi
if [[ "${PROXY_MODE}" == "bundled" ]] && command -v ss >/dev/null; then
  for proxy_port in 80 443; do
    if ss -H -ltn "sport = :${proxy_port}" | grep -q .; then
      echo "Bundled Caddy port ${proxy_port} is already in use." >&2
      exit 1
    fi
  done
fi

mkdir -p "${BOOTSTRAP_DIR}" "${VOSK_DIR}" "${IMPORT_COOKIES_DIR}"
EMMA_COMPOSE_FILES="docker-compose.yml"
if [[ "${OLLAMA_MODE}" == "container" ]]; then
  EMMA_COMPOSE_FILES="${EMMA_COMPOSE_FILES}:docker-compose.ollama.yml"
fi
if [[ "${PROXY_MODE}" == "bundled" ]]; then
  EMMA_COMPOSE_FILES="${EMMA_COMPOSE_FILES}:docker-compose.caddy.yml"
fi
COMPOSE_PROJECT_NAME="emma-cookbook"
COMPOSE_CONFIG_PATH="${ROOT_DIR}/.emma-compose.env"
{
  printf 'EMMA_ENV_FILE=%q\n' "${ENV_FILE_PATH}"
  printf 'EMMA_COMPOSE_FILES=%q\n' "${EMMA_COMPOSE_FILES}"
  printf 'COMPOSE_PROJECT_NAME=emma-cookbook\n'
} > "${COMPOSE_CONFIG_PATH}"
{
  printf 'ENV_FILE=%s\n' "${ENV_FILE_PATH}"
  printf 'COMPOSE_FILE=%s\n' "${EMMA_COMPOSE_FILES}"
  printf 'COMPOSE_PROJECT_NAME=emma-cookbook\n'
  printf 'EMMA_VERSION=%s\n' "${EMMA_VERSION}"
  printf 'EMMA_BACKEND_IMAGE=%s\n' "${EMMA_BACKEND_IMAGE}"
  printf 'EMMA_FRONTEND_IMAGE=%s\n' "${EMMA_FRONTEND_IMAGE}"
  printf 'FRONTEND_HTTP_BIND=%s\n' "${FRONTEND_HTTP_BIND}"
} > "${ROOT_DIR}/.env"

# shellcheck source=scripts/lib/compose.sh
source "${ROOT_DIR}/scripts/lib/compose.sh"
export EMMA_VERSION EMMA_BACKEND_IMAGE EMMA_FRONTEND_IMAGE
write_env_file

echo "Preparing Vosk model..."
download_vosk_model "${VOSK_SOURCE}"

if [[ "${IMAGE_SOURCE}" == "local" ]]; then
  echo "Building Docker images locally..."
  compose_run build backend worker beat frontend
else
  echo "Pulling published Docker images..."
  compose_run pull backend worker beat frontend
fi

echo "Starting infrastructure services..."
compose_run up -d --wait db redis
if [[ "${ENABLE_OLLAMA}" -eq 1 ]]; then
  compose_run up -d --wait ollama
  echo "Pulling Ollama model ${OLLAMA_DEFAULT_MODEL}..."
  compose_run exec -T ollama ollama pull "${OLLAMA_DEFAULT_MODEL}"
fi

INITIALIZATION_FLAG="--fresh-installation"
if [[ -n "${IMPORT_PATH}" ]]; then
  INITIALIZATION_FLAG="--existing-installation"
  case "${IMPORT_PATH##*.}" in
    sql)
      echo "Importing PostgreSQL dump..."
      "${ROOT_DIR}/scripts/import_db.sh" "${IMPORT_PATH}"
      ;;
    json)
      echo "Importing JSON application backup..."
      cp "${IMPORT_PATH}" "${BOOTSTRAP_DIR}/import-backup.json"
      compose_run run --rm --entrypoint /bin/bash backend -lc \
        "python manage.py migrate --noinput && python manage.py import_backup /bootstrap/import-backup.json"
      ;;
    *) echo "Unsupported backup format: ${IMPORT_PATH}" >&2; exit 1 ;;
  esac
fi

echo "Applying migrations and initializing application mode..."
compose_run run --rm --entrypoint /bin/bash backend -lc \
  "python manage.py migrate --noinput && python manage.py initialize_instance_mode ${INITIALIZATION_FLAG}"

if [[ "${SEED_DATA}" -eq 1 ]]; then
  compose_run run --rm --entrypoint /bin/bash backend -lc \
    "python manage.py seed_internal_data --username \"${DJANGO_SUPERUSER_USERNAME}\" --password \"${DJANGO_SUPERUSER_PASSWORD}\" --reset"
elif [[ "${APP_MODE}" == "multi_user" && "${AUTH_PROVIDER}" == "jwt" ]]; then
  compose_run run --rm --entrypoint /bin/bash backend -lc \
    "python manage.py create_super_user \"${DJANGO_SUPERUSER_USERNAME}\" \"${DJANGO_SUPERUSER_PASSWORD}\""
fi

diagnostics() {
  compose_run ps -a || true
  compose_run logs --tail=100 backend || true
}
trap 'echo "Setup failed; collecting diagnostics." >&2; diagnostics' ERR

echo "Starting application services and waiting for health checks..."
SERVICES=(backend worker beat frontend)
if [[ "${PROXY_MODE}" == "bundled" ]]; then
  SERVICES+=(caddy)
fi
compose_run up -d --wait "${SERVICES[@]}"

VERIFY_HOST="${FRONTEND_HTTP_BIND%:*}"
if [[ "${VERIFY_HOST}" == "0.0.0.0" || "${VERIFY_HOST}" == "${FRONTEND_HTTP_BIND}" ]]; then
  VERIFY_HOST="127.0.0.1"
fi
VERIFY_ORIGIN="http://${VERIFY_HOST}:${FRONTEND_PORT}"
curl --fail --silent --show-error "${VERIFY_ORIGIN}/" >/dev/null
curl --fail --silent --show-error "${VERIFY_ORIGIN}/api/health/" >/dev/null
curl --fail --silent --show-error "${VERIFY_ORIGIN}/api/app/config/" >/dev/null
PROFILE_STATUS="$(curl --silent --output /dev/null --write-out '%{http_code}' "${VERIFY_ORIGIN}/api/users/me/")"
if [[ "${PROFILE_STATUS}" != "200" && "${PROFILE_STATUS}" != "401" ]]; then
  echo "Unexpected profile endpoint status: ${PROFILE_STATUS}" >&2
  false
fi
trap - ERR

cat <<EOF

Setup complete.

Environment file: ${ENV_FILE_PATH}
Compose config: ${COMPOSE_CONFIG_PATH}
Frontend URL: ${PUBLIC_APP_URL}
Frontend binding: ${FRONTEND_HTTP_BIND}
Application mode: ${APP_MODE}
Proxy mode: ${PROXY_MODE}
Version tag: ${EMMA_VERSION}
EOF

if [[ "${PROXY_MODE}" == "external" ]]; then
  cat <<EOF

External Caddy example:

${PUBLIC_HOST} {
    tls internal
    reverse_proxy ${FRONTEND_HTTP_BIND}
}
EOF
elif [[ "${PROXY_MODE}" == "bundled" ]]; then
  echo "Trust docker-data/caddy/data/caddy/pki/authorities/local/root.crt on client devices."
fi

cat <<EOF

Routine commands now work without exporting ENV_FILE:
  docker compose ps
  ./scripts/update_docker_production.sh <tag>

Place optional import cookies at ${IMPORT_COOKIES_DIR}/cookies.txt.
EOF
