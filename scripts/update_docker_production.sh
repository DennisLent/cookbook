#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/lib/compose.sh
source "${ROOT_DIR}/scripts/lib/compose.sh"
VERSION_TAG="${1:-}"

read_env_value() {
  local key="$1"
  local value
  value="$(grep -E "^${key}=" "${ENV_FILE_PATH}" | tail -n 1 | cut -d '=' -f 2-)"
  printf '%s' "${value}"
}

if [[ ! -f "${ENV_FILE_PATH}" ]]; then
  echo "Environment file not found: ${ENV_FILE_PATH}" >&2
  exit 1
fi

if [[ -n "${VERSION_TAG}" ]]; then
  if [[ ! "${VERSION_TAG}" =~ ^[A-Za-z0-9._-]+$ ]]; then
    echo "Invalid version tag: ${VERSION_TAG}" >&2
    exit 2
  fi
  EMMA_VERSION="${VERSION_TAG}"
  sed -i "s/^EMMA_VERSION=.*/EMMA_VERSION=${VERSION_TAG}/" "${ENV_FILE_PATH}"
  sed -i "s/^APP_VERSION=.*/APP_VERSION=${VERSION_TAG}/" "${ENV_FILE_PATH}"
  if [[ -f "${ROOT_DIR}/.env" ]]; then
    sed -i "s/^EMMA_VERSION=.*/EMMA_VERSION=${VERSION_TAG}/" "${ROOT_DIR}/.env"
  fi
fi

echo "Using environment file: ${ENV_FILE_PATH}"
if [[ -n "${VERSION_TAG}" ]]; then
  echo "Target version: ${VERSION_TAG}"
fi

EMMA_BACKEND_IMAGE="${EMMA_BACKEND_IMAGE:-$(read_env_value EMMA_BACKEND_IMAGE)}"
EMMA_FRONTEND_IMAGE="${EMMA_FRONTEND_IMAGE:-$(read_env_value EMMA_FRONTEND_IMAGE)}"
EMMA_VERSION="${EMMA_VERSION:-$(read_env_value EMMA_VERSION)}"
EMMA_GIT_SHA="${EMMA_GIT_SHA:-$(read_env_value EMMA_GIT_SHA)}"

export EMMA_BACKEND_IMAGE EMMA_FRONTEND_IMAGE EMMA_VERSION EMMA_GIT_SHA
compose_run pull backend worker beat frontend
compose_run run --rm --entrypoint /bin/bash backend -lc \
  "python manage.py migrate --noinput && python manage.py initialize_instance_mode --existing-installation"
compose_run up -d --wait backend worker beat frontend

echo "emma-cookbook services updated."
