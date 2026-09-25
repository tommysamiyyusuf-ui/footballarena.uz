"""
The booking engine: pricing, validation, state machine and — above all —
double-booking protection under concurrency.
"""
from __future__ import annotations

import threading
from datetime import time, timedelta
from decimal import Decimal

import pytest
from django.db import IntegrityError, connections, transaction
from django.utils import timezone

from apps.bookings.models import Booking, BookingStatus
from apps.common.exceptions import SlotUnavailable
from apps.common.models import PlatformSetting
from apps.common.utils import combine_date_time

pytestmark = pytest.mark.django_db

CREATE_URL = "/api/bookings/create_booking/"
QUOTE_URL = "/api/bookings/quote/"


def book(client, stadium, day, start="10:00", hours=2, **extra):
    payload = {
        "stadium_id": str(stadium.id),
        "date": day.isoformat(),
        "start_time": start,
        "duration_hours": hours,
    }
    payload.update(extra)
    return client.post(CREATE_URL, payload, format="json")


# --- Pricing -----------------------------------------------------------------

def test_quote_is_hourly_price_times_duration(auth, customer, stadium):
    response = auth(customer).post(
        QUOTE_URL, {"stadium_id": str(stadium.id), "duration_hours": 3}, format="json"
    )
    assert response.status_code == 200
    assert Decimal(response.data["total_price"]) == Decimal("450000.00")
    assert Decimal(response.data["commission_percent"]) == Decimal("10.00")
    assert Decimal(response.data["commission_amount"]) == Decimal("45000.00")
    assert Decimal(response.data["owner_earning"]) == Decimal("405000.00")
    assert response.data["currency"] == "UZS"


def test_price_is_computed_on_the_server(auth, customer, stadium, tomorrow):
    response = book(auth(customer), stadium, tomorrow, hours=2)
    assert response.status_code == 201, response.data
    assert Decimal(response.data["total_price"]) == Decimal("300000.00")
    assert Decimal(response.data["hourly_price"]) == stadium.price_per_hour


def test_a_client_supplied_price_is_ignored(auth, customer, stadium, tomorrow):
    """The frontend may send whatever it likes; the backend recalculates."""
    response = book(
        auth(customer), stadium, tomorrow, hours=2,
        total_price="1.00", hourly_price="1.00", commission_amount="0.00",
    )
    assert response.status_code == 201
    booking = Booking.objects.get(pk=response.data["id"])
    assert booking.total_price == Decimal("300000.00")
    assert booking.commission_amount == Decimal("30000.00")
    assert booking.owner_earning == Decimal("270000.00")


def test_per_owner_commission_override_wins(auth, customer, stadium, tomorrow):
    profile = stadium.owner.owner_profile
    profile.commission_percent = Decimal("5.00")
    profile.save(update_fields=["commission_percent"])

    response = book(auth(customer), stadium, tomorrow, hours=2)
    assert response.status_code == 201
    assert Decimal(response.data["commission_amount"]) == Decimal("15000.00")


# --- Creation ----------------------------------------------------------------

def test_booking_starts_pending_and_derives_its_own_end_time(auth, customer, stadium,
                                                             tomorrow):
    response = book(auth(customer), stadium, tomorrow, start="10:00", hours=2)
    assert response.status_code == 201
    assert response.data["status"] == BookingStatus.PENDING
    assert response.data["end_time"] == "12:00:00"
    assert response.data["reference"]

    booking = Booking.objects.get(pk=response.data["id"])
    assert booking.owner_id == stadium.owner_id
    assert booking.status_history.count() == 1


def test_owner_cannot_book(auth, owner, stadium, tomorrow):
    assert book(auth(owner), stadium, tomorrow).status_code == 403


def test_anonymous_cannot_book(api, stadium, tomorrow):
    assert book(api, stadium, tomorrow).status_code == 401


def test_past_dates_are_refused(auth, customer, stadium):
    yesterday = timezone.localdate() - timedelta(days=1)
    response = book(auth(customer), stadium, yesterday)
    assert response.status_code == 400
    assert "o'tgan" in response.data["message"].lower()


def test_booking_too_far_ahead_is_refused(auth, customer, stadium):
    far = timezone.localdate() + timedelta(days=400)
    assert book(auth(customer), stadium, far).status_code == 400


def test_half_hour_starts_are_refused(auth, customer, stadium, tomorrow):
    response = book(auth(customer), stadium, tomorrow, start="10:30")
    assert response.status_code == 400


def test_outside_working_hours_is_refused(auth, customer, stadium, tomorrow):
    """The stadium closes at 23:00, so a 22:00 booking of 2h does not fit."""
    response = book(auth(customer), stadium, tomorrow, start="22:00", hours=2)
    assert response.status_code == 400
    assert "ish vaqti" in response.data["message"].lower()


def test_duration_beyond_the_platform_maximum_is_refused(auth, customer, stadium,
                                                         tomorrow):
    config = PlatformSetting.load()
    response = book(auth(customer), stadium, tomorrow, start="08:00",
                    hours=config.booking_max_duration_hours + 1)
    assert response.status_code == 400


def test_a_pending_stadium_cannot_be_booked(auth, customer, pending_stadium, tomorrow):
    response = book(auth(customer), pending_stadium, tomorrow)
    assert response.status_code in (400, 404)
    assert not Booking.objects.filter(stadium=pending_stadium).exists()


# --- Double booking ----------------------------------------------------------

def test_identical_slot_is_rejected_with_alternatives(auth, customer, other_customer,
                                                      stadium, tomorrow):
    assert book(auth(customer), stadium, tomorrow, start="10:00", hours=2).status_code == 201

    clash = book(auth(other_customer), stadium, tomorrow, start="10:00", hours=2)
    assert clash.status_code == 409
    assert clash.data["code"] == "slot_unavailable"
    assert "band qilingan" in clash.data["message"]

    starts = {row["start_time"] for row in clash.data["alternatives"]}
    assert starts, "the API must propose other free windows"
    assert "10:00" not in starts


@pytest.mark.parametrize(
    ("start", "hours"),
    [
        ("11:00", 2),  # starts inside the existing booking
        ("09:00", 2),  # ends inside the existing booking
        ("09:00", 4),  # swallows the existing booking whole
        ("11:00", 1),  # sits entirely inside it
    ],
)
def test_partial_overlaps_are_rejected(auth, customer, other_customer, stadium,
                                       tomorrow, start, hours):
    assert book(auth(customer), stadium, tomorrow, start="10:00", hours=2).status_code == 201
    clash = book(auth(other_customer), stadium, tomorrow, start=start, hours=hours)
    assert clash.status_code == 409
    assert Booking.objects.filter(stadium=stadium, date=tomorrow).count() == 1


def test_adjacent_slots_both_fit(auth, customer, other_customer, stadium, tomorrow):
    """10-12 and 12-14 touch but do not overlap — the range is half-open."""
    assert book(auth(customer), stadium, tomorrow, start="10:00", hours=2).status_code == 201
    assert book(auth(other_customer), stadium, tomorrow,
                start="12:00", hours=2).status_code == 201
    assert Booking.objects.filter(stadium=stadium, date=tomorrow).count() == 2


def test_the_same_slot_on_another_stadium_is_fine(auth, customer, other_customer,
                                                  stadium, other_owner, tomorrow):
    from apps.stadiums.models import (
        FieldType,
        Stadium,
        StadiumStatus,
        StadiumWorkingHour,
    )

    second = Stadium.objects.create(
        owner=other_owner, name="Ikkinchi Arena", field_type=FieldType.F5,
        price_per_hour=Decimal("100000.00"), city="Toshkent", address="Y",
        latitude=41.3, longitude=69.3, status=StadiumStatus.APPROVED,
    )
    for weekday in range(7):
        StadiumWorkingHour.objects.create(stadium=second, weekday=weekday,
                                          open_time=time(6, 0), close_time=time(23, 0))

    assert book(auth(customer), stadium, tomorrow, start="10:00").status_code == 201
    assert book(auth(other_customer), second, tomorrow, start="10:00").status_code == 201


def test_a_customer_cannot_be_in_two_places_at_once(auth, customer, stadium,
                                                    other_owner, tomorrow):
    from apps.stadiums.models import (
        FieldType,
        Stadium,
        StadiumStatus,
        StadiumWorkingHour,
    )

    second = Stadium.objects.create(
        owner=other_owner, name="Uchinchi Arena", field_type=FieldType.F5,
        price_per_hour=Decimal("100000.00"), city="Toshkent", address="Z",
        latitude=41.4, longitude=69.4, status=StadiumStatus.APPROVED,
    )
    for weekday in range(7):
        StadiumWorkingHour.objects.create(stadium=second, weekday=weekday,
                                          open_time=time(6, 0), close_time=time(23, 0))

    assert book(auth(customer), stadium, tomorrow, start="10:00").status_code == 201
    clash = book(auth(customer), second, tomorrow, start="11:00")
    assert clash.status_code == 409
    assert "boshqa bron" in clash.data["message"]


def test_a_cancelled_slot_becomes_free_again(auth, customer, other_customer, stadium,
                                             tomorrow):
    first = book(auth(customer), stadium, tomorrow, start="10:00")
    assert first.status_code == 201

    cancelled = auth(customer).post(
        f"/api/bookings/{first.data['id']}/cancel/", {"reason": "Rejam o'zgardi"},
        format="json",
    )
    assert cancelled.status_code == 200
    assert cancelled.data["status"] == BookingStatus.CANCELLED

    assert book(auth(other_customer), stadium, tomorrow, start="10:00").status_code == 201


def test_the_database_itself_refuses_an_overlap(customer, other_customer, stadium,
                                                tomorrow):
    """
    Bypass the service layer entirely: the `booking_no_overlap` exclusion
    constraint must stop the row even when no application code is involved.
    """
    starts_at = combine_date_time(tomorrow, time(10, 0))
    fields = dict(
        owner=stadium.owner, stadium=stadium, date=tomorrow,
        duration_hours=2, hourly_price=stadium.price_per_hour,
        total_price=Decimal("300000.00"), status=BookingStatus.PENDING,
    )
    Booking.objects.create(
        user=customer, start_time="10:00", end_time="12:00",
        starts_at=starts_at, ends_at=starts_at + timedelta(hours=2), **fields
    )

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            Booking.objects.create(
                user=other_customer, start_time="11:00", end_time="13:00",
                starts_at=starts_at + timedelta(hours=1),
                ends_at=starts_at + timedelta(hours=3), **fields
            )


@pytest.mark.slow
@pytest.mark.django_db(transaction=True)
def test_only_one_of_ten_racing_requests_wins(customer, other_customer, stadium,
                                              tomorrow):
    """
    Ten threads fire at the same slot simultaneously. Exactly one booking may
    survive — this is the requirement the whole locking strategy exists for.
    """
    from apps.bookings.services import create_booking

    users = [customer, other_customer]
    barrier = threading.Barrier(10)
    results: list[str] = []
    lock = threading.Lock()

    def attempt(index: int) -> None:
        try:
            barrier.wait(timeout=10)
            create_booking(
                user=users[index % 2], stadium_id=stadium.id, day=tomorrow,
                start=time(14, 0), duration_hours=2,
            )
            outcome = "created"
        except SlotUnavailable:
            outcome = "rejected"
        except Exception as exc:  # surfaced below so failures are readable
            outcome = f"error:{type(exc).__name__}:{exc}"
        finally:
            connections.close_all()
        with lock:
            results.append(outcome)

    threads = [threading.Thread(target=attempt, args=(i,)) for i in range(10)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)

    errors = [r for r in results if r.startswith("error:")]
    assert not errors, errors
    assert results.count("created") == 1, results
    assert Booking.objects.filter(stadium=stadium, date=tomorrow,
                                  start_time=time(14, 0)).count() == 1


# --- State machine -----------------------------------------------------------

@pytest.fixture
def pending_booking(auth, customer, stadium, tomorrow):
    response = book(auth(customer), stadium, tomorrow, start="10:00", hours=2)
    assert response.status_code == 201
    return Booking.objects.get(pk=response.data["id"])


def test_owner_approves(auth, owner, pending_booking):
    response = auth(owner).post(f"/api/bookings/{pending_booking.id}/approve/")
    assert response.status_code == 200
    assert response.data["status"] == BookingStatus.APPROVED
    pending_booking.refresh_from_db()
    assert pending_booking.approved_at is not None


def test_another_owner_cannot_approve(auth, other_owner, pending_booking):
    response = auth(other_owner).post(f"/api/bookings/{pending_booking.id}/approve/")
    assert response.status_code == 400
    pending_booking.refresh_from_db()
    assert pending_booking.status == BookingStatus.PENDING


def test_the_customer_cannot_approve_their_own_booking(auth, customer, pending_booking):
    response = auth(customer).post(f"/api/bookings/{pending_booking.id}/approve/")
    assert response.status_code == 403


def test_approving_twice_is_refused(auth, owner, pending_booking):
    assert auth(owner).post(f"/api/bookings/{pending_booking.id}/approve/").status_code == 200
    second = auth(owner).post(f"/api/bookings/{pending_booking.id}/approve/")
    assert second.status_code == 400


def test_rejection_requires_a_reason(auth, owner, pending_booking):
    blank = auth(owner).post(f"/api/bookings/{pending_booking.id}/reject/",
                             {"reason": "   "}, format="json")
    assert blank.status_code == 400

    ok = auth(owner).post(f"/api/bookings/{pending_booking.id}/reject/",
                          {"reason": "Maydon ta'mirlanmoqda"}, format="json")
    assert ok.status_code == 200
    assert ok.data["status"] == BookingStatus.REJECTED
    assert ok.data["rejection_reason"] == "Maydon ta'mirlanmoqda"


def test_a_rejected_slot_is_released(auth, owner, other_customer, pending_booking,
                                     stadium, tomorrow):
    auth(owner).post(f"/api/bookings/{pending_booking.id}/reject/",
                     {"reason": "Band"}, format="json")
    assert book(auth(other_customer), stadium, tomorrow, start="10:00").status_code == 201


def test_customer_cancels_outside_the_cancel_window(auth, customer, pending_booking):
    response = auth(customer).post(f"/api/bookings/{pending_booking.id}/cancel/",
                                   {"reason": "Kasal bo'lib qoldim"}, format="json")
    assert response.status_code == 200
    assert response.data["status"] == BookingStatus.CANCELLED


def test_customer_cannot_cancel_inside_the_cancel_window(auth, customer,
                                                         pending_booking):
    config = PlatformSetting.load()
    pending_booking.starts_at = timezone.now() + timedelta(
        hours=config.booking_cancel_window_hours - 1
    )
    pending_booking.save(update_fields=["starts_at"])

    response = auth(customer).post(f"/api/bookings/{pending_booking.id}/cancel/",
                                   {"reason": "Kech"}, format="json")
    assert response.status_code == 400


def test_a_stranger_cannot_touch_someone_elses_booking(auth, other_customer,
                                                       pending_booking):
    assert auth(other_customer).get(
        f"/api/bookings/{pending_booking.id}/"
    ).status_code == 404
    assert auth(other_customer).post(
        f"/api/bookings/{pending_booking.id}/cancel/", {}, format="json"
    ).status_code == 404


# --- Visibility --------------------------------------------------------------

def test_each_role_sees_only_what_it_should(auth, customer, other_customer, owner,
                                            admin_user, pending_booking):
    assert len(auth(customer).get("/api/bookings/").data["results"]) == 1
    assert len(auth(other_customer).get("/api/bookings/").data["results"]) == 0
    assert len(auth(owner).get("/api/bookings/").data["results"]) == 1
    assert len(auth(admin_user).get("/api/bookings/").data["results"]) == 1


def test_availability_marks_the_booked_hours(api, stadium, tomorrow, pending_booking):
    response = api.get(f"/api/stadiums/{stadium.id}/availability/",
                       {"date": tomorrow.isoformat()})
    assert response.status_code == 200
    slots = {slot["start_time"]: slot["is_available"] for slot in response.data["slots"]}
    assert slots["10:00"] is False
    assert slots["11:00"] is False
    assert slots["12:00"] is True
