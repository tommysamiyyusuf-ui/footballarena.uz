"""Stadium creation, the admin moderation queue, geo search and filters."""
from __future__ import annotations

from decimal import Decimal

import pytest

from apps.stadiums.models import FieldType, Stadium, StadiumStatus

pytestmark = pytest.mark.django_db

NEW_STADIUM = {
    "name": "Chempion Arena",
    "description": "Sun'iy qoplamali maydon",
    "field_type": FieldType.F7,
    "capacity": 14,
    "price_per_hour": "180000.00",
    "city": "Toshkent",
    "district": "Mirzo Ulug'bek",
    "address": "Mustaqillik 45",
    "latitude": 41.325,
    "longitude": 69.335,
    "phone": "+998901234567",
}


# --- Creation ----------------------------------------------------------------

def test_owner_creates_a_stadium_which_starts_pending(auth, owner):
    response = auth(owner).post("/api/stadiums/", NEW_STADIUM, format="json")
    assert response.status_code == 201, response.data

    stadium = Stadium.objects.get(pk=response.data["id"])
    assert stadium.owner_id == owner.id
    assert stadium.status == StadiumStatus.PENDING
    # A stadium without explicit hours still gets a sensible default schedule.
    assert stadium.working_hours.count() == 7


def test_the_owner_field_cannot_be_spoofed(auth, owner, other_owner):
    payload = {**NEW_STADIUM, "owner": str(other_owner.id)}
    response = auth(owner).post("/api/stadiums/", payload, format="json")
    assert response.status_code == 201
    assert Stadium.objects.get(pk=response.data["id"]).owner_id == owner.id


def test_the_status_cannot_be_self_approved(auth, owner):
    payload = {**NEW_STADIUM, "status": StadiumStatus.APPROVED}
    response = auth(owner).post("/api/stadiums/", payload, format="json")
    assert response.status_code == 201
    assert Stadium.objects.get(pk=response.data["id"]).status == StadiumStatus.PENDING


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("price_per_hour", "0"),
        ("price_per_hour", "-5000"),
        ("latitude", 120.0),
        ("longitude", 500.0),
    ],
)
def test_invalid_geo_and_price_values_are_refused(auth, owner, field, value):
    response = auth(owner).post("/api/stadiums/", {**NEW_STADIUM, field: value},
                                format="json")
    assert response.status_code == 400
    assert field in response.data["errors"]


def test_duplicate_weekdays_in_working_hours_are_refused(auth, owner):
    payload = {
        **NEW_STADIUM,
        "working_hours": [
            {"weekday": 1, "open_time": "08:00", "close_time": "22:00"},
            {"weekday": 1, "open_time": "09:00", "close_time": "23:00"},
        ],
    }
    response = auth(owner).post("/api/stadiums/", payload, format="json")
    assert response.status_code == 400


def test_amenities_can_be_attached(auth, owner, amenities):
    payload = {**NEW_STADIUM, "amenity_ids": [a.id for a in amenities[:2]]}
    response = auth(owner).post("/api/stadiums/", payload, format="json")
    assert response.status_code == 201
    assert Stadium.objects.get(pk=response.data["id"]).amenities.count() == 2


# --- Moderation --------------------------------------------------------------

def test_pending_queue_lists_only_pending_stadiums(auth, admin_user, stadium,
                                                   pending_stadium):
    response = auth(admin_user).get("/api/admin-panel/stadiums/pending/")
    assert response.status_code == 200
    ids = {row["id"] for row in response.data["results"]}
    assert ids == {str(pending_stadium.id)}


def test_admin_approval_publishes_the_stadium(api, auth, admin_user, pending_stadium):
    assert api.get(f"/api/stadiums/{pending_stadium.id}/").status_code == 404

    response = auth(admin_user).post(
        f"/api/admin-panel/stadiums/{pending_stadium.id}/moderate/",
        {"action": "APPROVE"}, format="json",
    )
    assert response.status_code == 200

    pending_stadium.refresh_from_db()
    assert pending_stadium.status == StadiumStatus.APPROVED
    assert pending_stadium.reviewed_by_id == admin_user.id
    assert pending_stadium.reviewed_at is not None
    assert api.get(f"/api/stadiums/{pending_stadium.id}/").status_code == 200


def test_admin_rejection_keeps_the_stadium_hidden(api, auth, admin_user,
                                                  pending_stadium):
    response = auth(admin_user).post(
        f"/api/admin-panel/stadiums/{pending_stadium.id}/moderate/",
        {"action": "REJECT", "note": "Rasmlar sifatsiz"}, format="json",
    )
    assert response.status_code == 200
    pending_stadium.refresh_from_db()
    assert pending_stadium.status == StadiumStatus.REJECTED
    assert pending_stadium.moderation_note == "Rasmlar sifatsiz"
    assert api.get(f"/api/stadiums/{pending_stadium.id}/").status_code == 404


def test_moderation_is_written_to_the_audit_log(auth, admin_user, pending_stadium):
    from apps.common.models import AuditLog

    auth(admin_user).post(
        f"/api/admin-panel/stadiums/{pending_stadium.id}/moderate/",
        {"action": "APPROVE"}, format="json",
    )
    assert AuditLog.objects.filter(actor=admin_user,
                                   action=AuditLog.Action.STADIUM_APPROVED).exists()


def test_an_owner_cannot_moderate(auth, owner, pending_stadium):
    response = auth(owner).post(
        f"/api/admin-panel/stadiums/{pending_stadium.id}/moderate/",
        {"action": "APPROVE"}, format="json",
    )
    assert response.status_code == 403
    pending_stadium.refresh_from_db()
    assert pending_stadium.status == StadiumStatus.PENDING


def test_editing_a_rejected_stadium_sends_it_back_to_moderation(auth, owner,
                                                                pending_stadium):
    pending_stadium.status = StadiumStatus.REJECTED
    pending_stadium.save(update_fields=["status"])

    response = auth(owner).patch(f"/api/stadiums/{pending_stadium.id}/",
                                 {"name": "Tuzatilgan Maydon"}, format="json")
    assert response.status_code == 200
    pending_stadium.refresh_from_db()
    assert pending_stadium.status == StadiumStatus.PENDING


def test_a_blocked_owners_stadium_disappears_from_the_catalogue(api, owner, stadium):
    assert api.get("/api/stadiums/").data["count"] == 1
    owner.block("Shartnoma buzilgan")
    assert api.get("/api/stadiums/").data["count"] == 0


# --- Search, filters, geo ----------------------------------------------------

@pytest.fixture
def catalogue(db, owner, other_owner, admin_user, amenities):
    """Three approved stadiums spread across the country and price bands."""
    from datetime import time

    from apps.stadiums.models import StadiumWorkingHour

    rows = [
        ("Chilonzor Mini", owner, "Toshkent", "Chilonzor", "80000.00",
         FieldType.MINI, 41.2769, 69.2039, 4.8),
        ("Yunusobod Maydon", owner, "Toshkent", "Yunusobod", "250000.00",
         FieldType.F7, 41.3600, 69.2870, 4.2),
        ("Samarqand Arena", other_owner, "Samarqand", "Registon", "150000.00",
         FieldType.F11, 39.6270, 66.9750, 3.5),
    ]
    stadiums = []
    for name, stadium_owner, city, district, price, field_type, lat, lng, rating in rows:
        obj = Stadium.objects.create(
            owner=stadium_owner, name=name, city=city, district=district,
            address=f"{district} 1", price_per_hour=Decimal(price),
            field_type=field_type, latitude=lat, longitude=lng,
            status=StadiumStatus.APPROVED, rating=Decimal(str(rating)),
            reviewed_by=admin_user,
        )
        for weekday in range(7):
            StadiumWorkingHour.objects.create(stadium=obj, weekday=weekday,
                                              open_time=time(6, 0),
                                              close_time=time(23, 0))
        stadiums.append(obj)

    stadiums[0].amenities.set(amenities[:2])   # parking + shower
    stadiums[1].amenities.set(amenities[1:3])  # shower + locker
    return stadiums


def _names(response):
    return {row["name"] for row in response.data["results"]}


def test_free_text_search_covers_name_city_and_district(api, catalogue):
    assert _names(api.get("/api/stadiums/", {"search": "Chilonzor"})) == {"Chilonzor Mini"}
    assert _names(api.get("/api/stadiums/", {"search": "samarqand"})) == {"Samarqand Arena"}
    assert len(api.get("/api/stadiums/", {"search": "Toshkent"}).data["results"]) == 2


def test_price_filter(api, catalogue):
    assert _names(api.get("/api/stadiums/", {"max_price": "100000"})) == {"Chilonzor Mini"}
    assert len(api.get("/api/stadiums/", {"min_price": "100000"}).data["results"]) == 2


def test_rating_filter(api, catalogue):
    assert len(api.get("/api/stadiums/", {"min_rating": "4"}).data["results"]) == 2
    assert _names(api.get("/api/stadiums/", {"min_rating": "4.5"})) == {"Chilonzor Mini"}


def test_field_type_filter(api, catalogue):
    assert _names(api.get("/api/stadiums/",
                          {"field_type": FieldType.F11})) == {"Samarqand Arena"}


def test_amenity_filter_requires_every_requested_amenity(api, catalogue, amenities):
    codes = f"{amenities[0].code},{amenities[1].code}"
    assert _names(api.get("/api/stadiums/", {"amenities": codes})) == {"Chilonzor Mini"}


def test_results_are_sorted_by_distance_from_the_user(api, catalogue):
    """Standing in Chilonzor, the nearest stadium must come first."""
    response = api.get("/api/stadiums/", {"lat": 41.2769, "lng": 69.2039})
    assert response.status_code == 200
    rows = response.data["results"]
    assert [row["name"] for row in rows][0] == "Chilonzor Mini"
    assert rows[0]["distance_km"] == pytest.approx(0.0, abs=0.05)
    # Samarqand is ~270 km away and must land last.
    assert rows[-1]["name"] == "Samarqand Arena"
    assert rows[-1]["distance_km"] > 200


def test_radius_filter_excludes_far_stadiums(api, catalogue):
    response = api.get("/api/stadiums/",
                       {"lat": 41.2769, "lng": 69.2039, "radius": 5})
    assert _names(response) == {"Chilonzor Mini"}


def test_a_broken_coordinate_is_a_clean_400(api, catalogue):
    response = api.get("/api/stadiums/", {"lat": "abc", "lng": "69.2"})
    assert response.status_code == 400
    assert response.data["success"] is False


def test_deleting_a_stadium_with_active_bookings_is_refused(auth, owner, customer,
                                                            stadium, tomorrow):
    from datetime import time

    from apps.bookings.services import create_booking

    create_booking(user=customer, stadium_id=stadium.id, day=tomorrow,
                   start=time(10, 0), duration_hours=2)

    response = auth(owner).delete(f"/api/stadiums/{stadium.id}/")
    assert response.status_code == 400
    assert Stadium.objects.filter(pk=stadium.id).exists()
