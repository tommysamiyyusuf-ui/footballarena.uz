#!/bin/sh
# One image, three roles. Railway runs web, worker and beat as separate services
# from the same build, so the role is chosen by SERVICE_ROLE rather than by
# giving each service its own start command.
set -e

case "${SERVICE_ROLE:-web}" in
  web)
    # Only the web role migrates: running it from three services at once would
    # race, and Django's migration lock is not a substitute for not trying.
    python manage.py migrate --noinput
    python manage.py collectstatic --noinput

    # First-run bootstrap. A managed host gives you no shell, so a fresh
    # database would otherwise have no way in: there is no admin, and creating
    # one through the API needs an admin already. Django reads the credentials
    # from DJANGO_SUPERUSER_*; it fails harmlessly once the account exists, so
    # the variables can be removed after the first boot.
    if [ -n "${DJANGO_SUPERUSER_USERNAME}" ] && [ -n "${DJANGO_SUPERUSER_PASSWORD}" ]; then
      python manage.py createsuperuser --noinput || true
    fi

    exec daphne -b 0.0.0.0 -p "${PORT:-8000}" config.asgi:application
    ;;
  worker)
    exec celery -A config worker -l info
    ;;
  beat)
    # /tmp because the app user cannot write to the image root.
    exec celery -A config beat -l info --schedule /tmp/celerybeat-schedule
    ;;
  *)
    echo "Unknown SERVICE_ROLE '${SERVICE_ROLE}' (expected web, worker or beat)" >&2
    exit 1
    ;;
esac
