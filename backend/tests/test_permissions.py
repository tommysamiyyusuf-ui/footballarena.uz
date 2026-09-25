"""Role isolation: a user must never reach owner or admin surfaces, and vice versa."""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.django_db

OWNER_ENDPOINTS = ["/api/owner/dashboard/", "/api/owner/statistics/", "/api/owner/calendar/"]
ADMIN_ENDPOINTS = [
    "/api/admin-panel/dashboard/",
    "/api/admin-panel/statistics/",
    "/api/admin-panel/users/",
    "/api/admin-panel/owners/",
    "/api/admin-panel/stadiums/",
    "/api/admin-panel/bookings/",
    "/api/admin-panel/finance/",
    "/api/admin-panel/settings/",
    "/api/admin-panel/audit-logs/",
]


@pytest.mark.parametrize("url", OWNER_ENDPOINTS)
def test_customer_cannot_reach_owner_panel(auth, customer, url):
    assert auth(customer).get(url).status_code == 403


@pytest.mark.parametrize("url", ADMIN_ENDPOINTS)
def test_customer_cannot_reach_admin_panel(auth, customer, url):
    assert auth(customer).get(url).status_code == 403


@pytest.mark.parametrize("url", ADMIN_ENDPOINTS)
def test_owner_cannot_reach_admin_panel(auth, owner, url):
    assert auth(owner).get(url).status_code == 403


@pytest.mark.parametrize("url", OWNER_ENDPOINTS + ADMIN_ENDPOINTS)
def test_anonymous_is_rejected_everywhere(api, url):
    assert api.get(url).status_code == 401


def test_owner_reaches_their_own_panel(auth, owner):
    assert auth(owner).get("/api/owner/dashboard/").status_code == 200


def test_admin_reaches_the_admin_panel(auth, admin_user):
    assert auth(admin_user).get("/api/admin-panel/dashboard/").status_code == 200


def test_owner_cannot_create_another_owner(auth, owner):
    response = auth(owner).post(
        "/api/admin-panel/owners/",
        {"first_name": "X", "phone": "+998905556677", "username": "hacker",
         "password": "Owner12345!"},
        format="json",
    )
    assert response.status_code == 403


def test_owner_only_sees_their_own_stadiums(auth, owner, other_owner, stadium):
    from apps.stadiums.models import Stadium

    Stadium.objects.create(
        owner=other_owner, name="Boshqa Maydon", price_per_hour=100000,
        city="Toshkent", address="X", latitude=41.0, longitude=69.0,
    )
    response = auth(owner).get("/api/stadiums/", {"mine": "true"})
    assert response.status_code == 200
    names = [row["name"] for row in response.data["results"]]
    assert names == [stadium.name]


def test_owner_cannot_edit_another_owners_stadium(auth, other_owner, stadium):
    response = auth(other_owner).patch(
        f"/api/stadiums/{stadium.id}/", {"name": "Ugallandi"}, format="json"
    )
    assert response.status_code in (403, 404)
    stadium.refresh_from_db()
    assert stadium.name == "Bunyodkor Arena"


def test_customer_cannot_create_a_stadium(auth, customer):
    response = auth(customer).post(
        "/api/stadiums/",
        {"name": "Mening maydonim", "price_per_hour": 100000, "city": "Toshkent",
         "address": "X", "latitude": 41.0, "longitude": 69.0, "field_type": "F5"},
        format="json",
    )
    assert response.status_code == 403


def test_only_approved_stadiums_are_publicly_listed(api, stadium, pending_stadium):
    response = api.get("/api/stadiums/")
    assert response.status_code == 200
    ids = {row["id"] for row in response.data["results"]}
    assert str(stadium.id) in ids
    assert str(pending_stadium.id) not in ids


def test_pending_stadium_is_not_publicly_retrievable(api, pending_stadium):
    assert api.get(f"/api/stadiums/{pending_stadium.id}/").status_code == 404


def test_owner_can_see_their_own_pending_stadium(auth, owner, pending_stadium):
    response = auth(owner).get(f"/api/stadiums/{pending_stadium.id}/")
    assert response.status_code == 200
