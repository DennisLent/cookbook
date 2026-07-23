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

if not parsed.scheme or not parsed.netloc:
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

run_compose() {
  local compose_args=()
  local compose_file
  for compose_file in "${COMPOSE_FILES[@]}"; do
    compose_args+=(-f "${compose_file}")
  done

  ENV_FILE="${ENV_FILE_PATH}" \
  EMMA_VERSION="${EMMA_VERSION}" \
  EMMA_GIT_SHA="${EMMA_GIT_SHA:-}" \
  EMMA_BACKEND_IMAGE="${EMMA_BACKEND_IMAGE}" \
  EMMA_FRONTEND_IMAGE="${EMMA_FRONTEND_IMAGE}" \
  docker compose "${compose_args[@]}" "$@"
}

mkdir -p "${BOOTSTRAP_DIR}" "${VOSK_DIR}" "${IMPORT_COOKIES_DIR}"

echo "Cookbook Docker production setup"

ENV_FILE_PATH="$(prompt_value "Environment file path" "${ENV_FILE_DEFAULT}")"
PUBLIC_APP_URL_INPUT="$(prompt_value "Public app URL" "http://localhost")"
PUBLIC_URL_SCHEME="https"
if [[ "${PUBLIC_APP_URL_INPUT}" != *"://"* ]]; then
  PUBLIC_URL_SCHEME="$(prompt_value "URL scheme for ${PUBLIC_APP_URL_INPUT} (http/https)" "https")"
fi
PUBLIC_APP_URL="$(normalize_origin_url "${PUBLIC_APP_URL_INPUT}" "${PUBLIC_URL_SCHEME}")"
PUBLIC_HOST="$(extract_host_from_url "${PUBLIC_APP_URL}")"
ALLOWED_HOSTS="$(prompt_value "Django ALLOWED_HOSTS" "${PUBLIC_HOST},localhost,127.0.0.1")"
ENABLE_LOCAL_TLS=0
FRONTEND_HTTP_BIND="80"
if prompt_yes_no "Enable local HTTPS with Caddy using an internal CA?" "$([[ "${PUBLIC_APP_URL}" == https://* ]] && echo y || echo n)"; then
  ENABLE_LOCAL_TLS=1
  FRONTEND_HTTP_BIND="127.0.0.1:8080"
fi
COMPOSE_FILES=("${ROOT_DIR}/docker-compose.yml")
if [[ "${ENABLE_LOCAL_TLS}" -eq 1 ]]; then
  COMPOSE_FILES+=("${ROOT_DIR}/docker-compose.caddy.yml")
fi
SECRET_KEY="$(generate_secret_key)"
EMMA_VERSION="$(prompt_value "emma-cookbook version tag" "latest")"
DOCKERHUB_NAMESPACE="$(prompt_value "Docker Hub namespace" "dennislent")"
EMMA_BACKEND_IMAGE="${DOCKERHUB_NAMESPACE}/emma-cookbook-backend"
EMMA_FRONTEND_IMAGE="${DOCKERHUB_NAMESPACE}/emma-cookbook-frontend"
APP_UPDATE_REPOSITORY="$(prompt_value "GitHub repository for update checks (owner/repo)" "DennisLent/emma-cookbook")"
APP_UPDATE_CHECK_ENABLED="False"
if [[ -n "${APP_UPDATE_REPOSITORY}" ]]; then
  APP_UPDATE_CHECK_ENABLED="True"
fi

POSTGRES_DB="$(prompt_value "PostgreSQL database name" "cookbook")"
POSTGRES_USER="$(prompt_value "PostgreSQL user" "cookbook")"
POSTGRES_PASSWORD="$(prompt_secret "PostgreSQL password")"

DJANGO_SUPERUSER_USERNAME="$(prompt_value "Django admin username" "admin")"
DJANGO_SUPERUSER_PASSWORD="$(prompt_secret "Django admin password")"

AUTH_PROVIDER="$(prompt_value "Auth provider (jwt/keycloak)" "jwt")"
KEYCLOAK_REALM="cookbook"
KEYCLOAK_URL="http://localhost:8080"
KEYCLOAK_CLIENT_ID="cookbook-web"
KEYCLOAK_AUDIENCE="cookbook-web"
KEYCLOAK_ADMIN_ROLE="cookbook-admin"
if [[ "${AUTH_PROVIDER}" == "keycloak" ]]; then
  KEYCLOAK_URL="$(prompt_value "Keycloak base URL" "${KEYCLOAK_URL}")"
  KEYCLOAK_REALM="$(prompt_value "Keycloak realm" "${KEYCLOAK_REALM}")"
  KEYCLOAK_CLIENT_ID="$(prompt_value "Keycloak client ID" "${KEYCLOAK_CLIENT_ID}")"
  KEYCLOAK_AUDIENCE="$(prompt_value "Keycloak audience" "${KEYCLOAK_CLIENT_ID}")"
  KEYCLOAK_ADMIN_ROLE="$(prompt_value "Keycloak admin role" "${KEYCLOAK_ADMIN_ROLE}")"
fi
KEYCLOAK_ISSUER="${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}"
KEYCLOAK_JWKS_URL="${KEYCLOAK_ISSUER}/protocol/openid-connect/certs"

IMPORT_EXISTING_DB=0
IMPORT_PATH=""
if prompt_yes_no "Load an existing database backup?" "n"; then
  IMPORT_EXISTING_DB=1
  IMPORT_PATH="$(prompt_value "Path to existing backup (.sql or .json)")"
  if [[ ! -f "${IMPORT_PATH}" ]]; then
    echo "Backup file not found: ${IMPORT_PATH}" >&2
    exit 1
  fi
fi

SEED_DATA=0
if [[ "${IMPORT_EXISTING_DB}" -eq 0 ]] && prompt_yes_no "Seed recipe data into the new database?" "n"; then
  SEED_DATA=1
fi

ENABLE_OLLAMA=0
OLLAMA_DEFAULT_MODEL="$(prompt_value "Default Ollama model" "llama3.2")"
OLLAMA_HOST="http://host.docker.internal:11434"
if prompt_yes_no "Run Ollama inside Docker?" "y"; then
  ENABLE_OLLAMA=1
  OLLAMA_HOST="http://ollama:11434"
fi

VOSK_SOURCE="$(prompt_value "Vosk model directory or zip URL" "${DEFAULT_VOSK_URL}")"

write_env_file

echo "Preparing Vosk model..."
download_vosk_model "${VOSK_SOURCE}"

if [[ "${DOCKERHUB_NAMESPACE}" == "local" ]]; then
  echo "Building Docker images locally..."
  run_compose build backend worker beat frontend
else
  echo "Pulling published Docker images..."
  run_compose pull backend worker beat frontend
fi

echo "Starting infrastructure services..."
run_compose up -d db redis
if [[ "${ENABLE_OLLAMA}" -eq 1 ]]; then
  run_compose up -d ollama
  echo "Pulling Ollama model ${OLLAMA_DEFAULT_MODEL}..."
  run_compose exec -T ollama ollama pull "${OLLAMA_DEFAULT_MODEL}"
fi

if [[ "${IMPORT_EXISTING_DB}" -eq 1 ]]; then
  case "${IMPORT_PATH##*.}" in
    sql)
      echo "Importing PostgreSQL dump..."
      ENV_FILE="${ENV_FILE_PATH}" "${ROOT_DIR}/scripts/import_db.sh" "${IMPORT_PATH}"
      ;;
    json)
      echo "Importing JSON application backup..."
      cp "${IMPORT_PATH}" "${BOOTSTRAP_DIR}/import-backup.json"
      run_compose run --rm --entrypoint /bin/bash backend -lc \
        "python manage.py migrate --noinput && python manage.py import_backup /bootstrap/import-backup.json"
      ;;
    *)
      echo "Unsupported backup format: ${IMPORT_PATH}" >&2
      exit 1
      ;;
  esac
fi

echo "Applying migrations and bootstrapping Django user data..."
if [[ "${SEED_DATA}" -eq 1 ]]; then
  run_compose run --rm --entrypoint /bin/bash backend -lc \
    "python manage.py migrate --noinput && python manage.py seed_internal_data --username \"${DJANGO_SUPERUSER_USERNAME}\" --password \"${DJANGO_SUPERUSER_PASSWORD}\" --reset"
else
  run_compose run --rm --entrypoint /bin/bash backend -lc \
    "python manage.py migrate --noinput && python manage.py create_super_user \"${DJANGO_SUPERUSER_USERNAME}\" \"${DJANGO_SUPERUSER_PASSWORD}\""
fi

echo "Starting application services..."
run_compose up -d backend worker beat frontend
if [[ "${ENABLE_LOCAL_TLS}" -eq 1 ]]; then
  run_compose up -d caddy
fi

cat <<EOF

Setup complete.

Environment file: ${ENV_FILE_PATH}
Frontend URL: ${PUBLIC_APP_URL}
Admin username: ${DJANGO_SUPERUSER_USERNAME}
Version tag: ${EMMA_VERSION}

Notes:
- If ${PUBLIC_HOST} is a custom hostname, make sure it resolves on the machine you are using.
- For local testing, add an entry such as `127.0.0.1 ${PUBLIC_HOST}` to your hosts file if DNS does not already provide it.
- Place an optional Netscape-format cookie export at ${IMPORT_COOKIES_DIR}/cookies.txt if Instagram or YouTube requires authenticated downloads from the server.
- If you enabled Caddy local TLS, trust the root certificate at docker-data/caddy/data/caddy/pki/authorities/local/root.crt on each client device and browse to https://${PUBLIC_HOST}
- Keycloak realm/client creation is still manual
- The Vosk model was prepared in ${VOSK_DIR}
- If you used a JSON backup import, the backend app data was restored before the services were started.
- To update later, run: `ENV_FILE=${ENV_FILE_PATH} ./scripts/update_docker_production.sh <tag>`
EOF
