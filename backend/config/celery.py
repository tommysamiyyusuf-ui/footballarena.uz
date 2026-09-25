import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

app = Celery("football_arena")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

app.conf.beat_schedule = {
    "expire-stale-bookings": {
        "task": "apps.bookings.tasks.expire_stale_bookings",
        "schedule": crontab(minute="*/10"),
    },
    "complete-finished-bookings": {
        "task": "apps.bookings.tasks.complete_finished_bookings",
        "schedule": crontab(minute="*/15"),
    },
    "purge-expired-otps": {
        "task": "apps.users.tasks.purge_expired_otps",
        "schedule": crontab(hour="*/6", minute=0),
    },
}
