#!/bin/sh
set -e

# wait for postgres
while ! nc -z "$POSTGRES_HOST" "$POSTGRES_PORT"; do
  echo "Waiting for postgres..."
  sleep 1
done

if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  python manage.py migrate
fi

if [ "${RUN_MIGRATIONS:-1}" = "1" ] && [ -n "${DJANGO_SUPERUSER_USERNAME:-}" ] && [ -n "${DJANGO_SUPERUSER_PASSWORD:-}" ]; then
  if [ "${SEED_INTERNAL_DATA:-0}" = "1" ]; then
    python manage.py seed_internal_data --username "$DJANGO_SUPERUSER_USERNAME" --password "$DJANGO_SUPERUSER_PASSWORD"
  else
    python manage.py create_super_user "$DJANGO_SUPERUSER_USERNAME" "$DJANGO_SUPERUSER_PASSWORD"
  fi
fi

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

exec gunicorn cookbook.wsgi:application --bind 0.0.0.0:8000
