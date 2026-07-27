#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_DIR="$(mktemp -d)"
PROJECT_NAME="emma-cookbook-bootstrap-test"
ENV_PATH="${TEST_DIR}/test.env"

cleanup() {
  ENV_FILE="${ENV_PATH}" COMPOSE_PROJECT_NAME="${PROJECT_NAME}" \
    docker compose -f "${ROOT_DIR}/docker-compose.yml" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "${TEST_DIR}"
}
trap cleanup EXIT

write_env() {
  local mode="$1"
  {
    echo "SECRET_KEY=bootstrap-integration-test"
    echo "DEBUG=False"
    echo "ALLOWED_HOSTS=backend,frontend,localhost,127.0.0.1"
    echo "CORS_ALLOWED_ORIGINS=http://127.0.0.1"
    echo "DATABASE_ENGINE=postgres"
    echo "POSTGRES_DB=cookbook"
    echo "POSTGRES_USER=cookbook"
    echo "POSTGRES_PASSWORD=bootstrap-test-password"
    echo "POSTGRES_HOST=db"
    echo "POSTGRES_PORT=5432"
    echo "APP_MODE=${mode}"
    echo "AUTH_PROVIDER=jwt"
    echo "CELERY_BROKER_URL=redis://redis:6379/0"
    echo "CELERY_RESULT_BACKEND=redis://redis:6379/0"
  } > "${ENV_PATH}"
}

compose_test() {
  ENV_FILE="${ENV_PATH}" \
  COMPOSE_PROJECT_NAME="${PROJECT_NAME}" \
  EMMA_VERSION="bootstrap-test" \
  docker compose -f "${ROOT_DIR}/docker-compose.yml" "$@"
}

assert_mode() {
  local expected_mode="$1"
  local expected_history="$2"
  compose_test run --rm --entrypoint python backend manage.py shell -c \
    "from users.models import InstanceConfiguration; c=InstanceConfiguration.get_solo(); assert c.mode == '${expected_mode}'; assert c.ever_multi_user is ${expected_history}"
}

run_fresh_case() {
  local mode="$1"
  write_env "${mode}"
  compose_test up -d --wait db redis
  compose_test run --rm --entrypoint /bin/bash backend -lc \
    "python manage.py migrate --noinput && python manage.py initialize_instance_mode --fresh-installation"
  assert_mode "${mode}" "$([[ "${mode}" == "multi_user" ]] && echo True || echo False)"
  compose_test up -d --wait backend
  compose_test exec -T backend python -c \
    "import urllib.request; assert urllib.request.urlopen('http://127.0.0.1:8000/api/health/').status == 200"
  compose_test down -v --remove-orphans
}

run_fresh_case single_user
run_fresh_case multi_user

write_env multi_user
compose_test up -d --wait db redis
compose_test run --rm --entrypoint /bin/bash backend -lc \
  "python manage.py migrate --noinput && python manage.py initialize_instance_mode --fresh-installation"
write_env single_user
if compose_test run --rm --entrypoint python backend manage.py initialize_instance_mode --validate-only; then
  echo "Existing multi-user database unexpectedly accepted single-user mode." >&2
  exit 1
fi

echo "Docker bootstrap integration tests passed."
