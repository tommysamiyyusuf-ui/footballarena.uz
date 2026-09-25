"""Reviews are earned: only a completed booking of your own may be reviewed, once."""
from __future__ import annotations

from datetime import time, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.bookings.models import Booking, BookingStatus
from apps.reviews.models import Review

pytestmark = pytest.mark.django_db

URL = "/api/reviews/"


def _booking(user, stadium, status=BookingStatus.COMPLETED, days_ago=3) -> Booking:
    day = timezone.localdate() - timedelta(days=days_ago)
    starts_at = timezone.now() - timedelta(days=days_ago)
    return Booking.objects.create(
        user=user, owner=stadium.owner, stadium=stadium, date=day,
        start_time=time(10, 0), end_time=time(12, 0), duration_hours=2,
        starts_at=starts_at, ends_at=starts_at + timedelta(hours=2),
        hourly_price=stadium.price_per_hour, total_price=Decimal("300000.00"),
        status=status,
        completed_at=timezone.now() if status == BookingStatus.COMPLETED else None,
    )


@pytest.fixture
def completed_booking(customer, stadium):
    return _booking(customer, stadium)


# --- Happy path --------------------------------------------------------------

def test_a_completed_booking_can_be_reviewed(auth, customer, completed_booking,
                                             stadium):
    response = auth(customer).post(
        URL, {"booking": str(completed_booking.id), "rating": 5,
              "comment": "Ajoyib maydon, tavsiya qilaman."},
        format="json",
    )
    assert response.status_code == 201, response.data

    review = Review.objects.get(pk=response.data["id"])
    assert review.stadium_id == stadium.id
    assert review.user_id == customer.id
    assert review.is_visible is True


def test_the_stadium_rating_is_recalculated(auth, customer, other_customer, stadium):
    for user, rating in ((customer, 5), (other_customer, 4)):
        booking = _booking(user, stadium, days_ago=3 if user == customer else 4)
        response = auth(user).post(URL, {"booking": str(booking.id), "rating": rating},
                                   format="json")
        assert response.status_code == 201

    stadium.refresh_from_db()
    assert stadium.rating == Decimal("4.50")
    assert stadium.review_count == 2


def test_the_owner_is_notified(auth, customer, owner, completed_booking):
    from apps.notifications.models import Notification

    auth(customer).post(URL, {"booking": str(completed_booking.id), "rating": 4},
                        format="json")
    assert Notification.objects.filter(recipient=owner, type="NEW_REVIEW").exists()


# --- Guard rails -------------------------------------------------------------

@pytest.mark.parametrize("status", [
    BookingStatus.PENDING,
    BookingStatus.APPROVED,
    BookingStatus.REJECTED,
    BookingStatus.CANCELLED,
    BookingStatus.EXPIRED,
])
def test_an_unfinished_booking_cannot_be_reviewed(auth, customer, stadium, status):
    booking = _booking(customer, stadium, status=status)
    response = auth(customer).post(URL, {"booking": str(booking.id), "rating": 5},
                                   format="json")
    assert response.status_code == 400
    assert "yakunlangan" in response.data["message"].lower()
    assert Review.objects.count() == 0


def test_you_cannot_review_someone_elses_booking(auth, other_customer,
                                                 completed_booking):
    response = auth(other_customer).post(
        URL, {"booking": str(completed_booking.id), "rating": 1}, format="json"
    )
    assert response.status_code == 400
    assert Review.objects.count() == 0


def test_one_review_per_booking(auth, customer, completed_booking):
    payload = {"booking": str(completed_booking.id), "rating": 5}
    assert auth(customer).post(URL, payload, format="json").status_code == 201

    second = auth(customer).post(URL, {**payload, "rating": 1}, format="json")
    assert second.status_code == 400
    assert Review.objects.count() == 1


@pytest.mark.parametrize("rating", [0, 6, -1, 99])
def test_ratings_outside_one_to_five_are_refused(auth, customer, completed_booking,
                                                 rating):
    response = auth(customer).post(
        URL, {"booking": str(completed_booking.id), "rating": rating}, format="json"
    )
    assert response.status_code == 400
    assert "rating" in response.data["errors"]


def test_an_owner_cannot_review(auth, owner, completed_booking):
    response = auth(owner).post(URL, {"booking": str(completed_booking.id),
                                      "rating": 5}, format="json")
    assert response.status_code == 403


def test_anonymous_cannot_review(api, completed_booking):
    response = api.post(URL, {"booking": str(completed_booking.id), "rating": 5},
                        format="json")
    assert response.status_code == 401


# --- Owner reply & moderation ------------------------------------------------

@pytest.fixture
def review(auth, customer, completed_booking):
    response = auth(customer).post(
        URL, {"booking": str(completed_booking.id), "rating": 2,
              "comment": "Yorug'lik yomon edi."},
        format="json",
    )
    assert response.status_code == 201
    return Review.objects.get(pk=response.data["id"])


def test_the_stadium_owner_can_reply(auth, owner, review):
    response = auth(owner).post(f"{URL}{review.id}/reply/",
                                {"reply": "Uzr, chiroqlar almashtirildi."},
                                format="json")
    assert response.status_code == 200
    review.refresh_from_db()
    assert review.owner_reply == "Uzr, chiroqlar almashtirildi."
    assert review.owner_replied_at is not None


def test_another_owner_cannot_reply(auth, other_owner, review):
    response = auth(other_owner).post(f"{URL}{review.id}/reply/",
                                      {"reply": "Salom"}, format="json")
    assert response.status_code == 400
    review.refresh_from_db()
    assert review.owner_reply == ""


def test_admin_can_hide_a_review_and_the_rating_follows(auth, admin_user, review,
                                                        stadium):
    stadium.refresh_from_db()
    assert stadium.review_count == 1

    response = auth(admin_user).post(f"/api/admin-panel/reviews/{review.id}/hide/",
                                     {"reason": "Haqoratli til"}, format="json")
    assert response.status_code == 200

    review.refresh_from_db()
    assert review.is_visible is False
    stadium.refresh_from_db()
    assert stadium.review_count == 0

    restored = auth(admin_user).post(f"/api/admin-panel/reviews/{review.id}/restore/")
    assert restored.status_code == 200
    stadium.refresh_from_db()
    assert stadium.review_count == 1


def test_hidden_reviews_are_not_public(api, auth, admin_user, review, stadium):
    review.is_visible = False
    review.save(update_fields=["is_visible"])

    public = api.get(URL, {"stadium": str(stadium.id)})
    assert public.data["count"] == 0

    moderator = auth(admin_user).get(URL, {"stadium": str(stadium.id)})
    assert moderator.data["count"] == 1


def test_reviews_are_filterable_by_stadium_and_author(api, auth, customer, review,
                                                      stadium):
    assert api.get(URL, {"stadium": str(stadium.id)}).data["count"] == 1
    assert auth(customer).get(URL, {"mine": "true"}).data["count"] == 1
