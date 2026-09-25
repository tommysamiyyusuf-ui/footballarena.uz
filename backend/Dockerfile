FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# libpq for psycopg, the image libraries for Pillow, curl for the healthcheck.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential libpq-dev libjpeg-dev zlib1g-dev curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

RUN adduser --disabled-password --gecos "" arena \
    && mkdir -p /app/media /app/staticfiles \
    && chmod +x /app/docker-entrypoint.sh \
    && chown -R arena:arena /app
USER arena

EXPOSE 8000

# The entrypoint picks web/worker/beat from SERVICE_ROLE, reads the $PORT Railway
# assigns at runtime, and migrates on the web role only — Railway has no separate
# release phase. docker-compose overrides the command, so local runs are
# unaffected. Daphne (not gunicorn) because the app serves WebSockets too.
CMD ["/app/docker-entrypoint.sh"]
