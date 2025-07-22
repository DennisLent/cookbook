#!/bin/sh
set -e

# wait for postgres
while ! nc -z "$POSTGRES_HOST" "$POSTGRES_PORT"; do
  echo "Waiting for postgres..."
  sleep 1
done

python manage.py migrate

if [ "$SEED_INTERNAL_DATA" = "1" ]; then
  python manage.py seed_internal_data --username "$DJANGO_SUPERUSER_USERNAME" --password "$DJANGO_SUPERUSER_PASSWORD"
fi

exec gunicorn cookbook.wsgi:application --bind 0.0.0.0:8000

