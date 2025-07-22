#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

# Config
DJANGO_DIR="backend"
ANGULAR_DIR="cookbook-app"
DJANGO_PORT=8000
ANGULAR_PORT=4200

activate_venv() {
  if [[ -f "venv/bin/activate" ]]; then
    echo "[backend] Activating virtualenv..."
    # shellcheck disable=SC1091
    source venv/bin/activate
  fi
}

start_backend() {
  echo ">>> Starting Django backend in ./${DJANGO_DIR}"

  activate_venv

  echo "[backend] Installing Python deps..."
  pip install -r requirements.txt

  pushd "${DJANGO_DIR}" >/dev/null

  echo "[backend] Applying migrations..."
  python manage.py makemigrations
  python manage.py migrate

  echo "[backend] Running server on http://127.0.0.1:${DJANGO_PORT}/"
  python manage.py runserver "${DJANGO_PORT}"

  popd >/dev/null
}


start_frontend() {
  echo ">>> Starting Angular frontend in ./${ANGULAR_DIR}"
  pushd "${ANGULAR_DIR}" >/dev/null

  echo "[frontend] Installing NPM deps (only if needed)..."
  npm install

  echo "[frontend] Running ng serve on http://127.0.0.1:${ANGULAR_PORT}/"
  ng serve --port "${ANGULAR_PORT}" --open

  popd >/dev/null
}


echo "Launching cookbook..."

start_backend &

sleep 3

start_frontend

wait
