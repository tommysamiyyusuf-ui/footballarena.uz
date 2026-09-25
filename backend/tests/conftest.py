from __future__ import annotations

from datetime import time, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.stadiums.models import (
    Amenity,
    FieldType,
    Stadium,
    StadiumStatus,
    StadiumWorkingHour,
)
from apps.users.models import OwnerProfile, Role, User, UserProfile


@pytest.fixture(autouse=True)
def _clean_cache():
    """OTP cooldowns and throttle counters live in the cache — never leak them."""
    from django.core.cache import cache

    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def auth(api):
    """`auth(user)` returns an APIClient carrying that user's access token."""
    from apps.users.services import issue_tokens

    def _auth(user):
        client = APIClient()
        client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {issue_tokens(user)['access']}"
        )
        return client

    return _auth


@pytest.fixture
def admin_user(db):
    user = User.objects.create_superuser(
        username="admin", password="Admin12345!", email="admin@arena.uz",
        phone="+998900000000", first_name="Platform", last_name="Admin",
    )
    UserProfile.objects.create(user=user)
    return user


@pytest.fixture
def owner(db, admin_user):
    user = User.objects.create_owner(
        username="owner1", password="Owner12345!", phone="+998901112233",
        email="owner1@arena.uz", first_name="Sardor", last_name="Rahimov",
        is_verified=True,
    )
    UserProfile.objects.create(user=user)
    OwnerProfile.objects.create(user=user, company_name="Arena MCHJ",
                                contact_phone=user.phone, created_by=admin_user)
    return user


@pytest.fixture
def other_owner(db, admin_user):
    user = User.objects.create_owner(
        username="owner2", password="Owner12345!", phone="+998902223344",
        first_name="Jasur", last_name="Nazarov", is_verified=True,
    )
    UserProfile.objects.create(user=user)
    OwnerProfile.objects.create(user=user, created_by=admin_user)
    return user


@pytest.fixture
def customer(db):
    user = User.objects.create_user(
        phone="+998911111101", first_name="Aziz", last_name="Karimov", is_verified=True
    )
    UserProfile.objects.create(user=user)
    return user


@pytest.fixture
def other_customer(db):
    user = User.objects.create_user(
        phone="+998911111102", first_name="Dilshod", last_name="Tursunov",
        is_verified=True,
    )
    UserProfile.objects.create(user=user)
    return user


def _open_all_week(stadium: Stadium) -> None:
    for weekday in range(7):
        StadiumWorkingHour.objects.create(
            stadium=stadium, weekday=weekday,
            open_time=time(6, 0), close_time=time(23, 0),
        )


@pytest.fixture
def stadium(db, owner, admin_user):
    obj = Stadium.objects.create(
        owner=owner, name="Bunyodkor Arena", field_type=FieldType.F5, capacity=10,
        price_per_hour=Decimal("150000.00"), city="Toshkent", district="Chilonzor",
        address="Bunyodkor 1", latitude=41.2769, longitude=69.2039,
        status=StadiumStatus.APPROVED, reviewed_by=admin_user,
        reviewed_at=timezone.now(),
    )
    _open_all_week(obj)
    return obj


@pytest.fixture
def pending_stadium(db, owner):
    obj = Stadium.objects.create(
        owner=owner, name="Yangi Maydon", field_type=FieldType.F7, capacity=14,
        price_per_hour=Decimal("200000.00"), city="Toshkent", district="Yunusobod",
        address="Amir Temur 108", latitude=41.36, longitude=69.287,
        status=StadiumStatus.PENDING,
    )
    _open_all_week(obj)
    return obj


@pytest.fixture
def tomorrow():
    return timezone.localdate() + timedelta(days=1)


@pytest.fixture
def amenities(db):
    return [
        Amenity.objects.create(code=code, name=code.title(), sort_order=index)
        for index, code in enumerate(["parking", "shower", "locker", "lighting"])
    ]
