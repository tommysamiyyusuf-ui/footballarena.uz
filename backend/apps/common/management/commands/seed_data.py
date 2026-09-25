"""
Populate a fresh database with realistic demo data.

    python manage.py seed_data
    python manage.py seed_data --flush     # wipe seeded rows first

Creates: 1 admin, 3 owners, 10 customers, 15 stadiums (12 approved / 2 pending /
1 rejected), working hours, amenities, bookings across every status, reviews on
completed bookings, favorites and notifications.

Idempotent: re-running matches on phone/username and updates instead of
duplicating, so it is safe to run against an existing dev database.
"""
from __future__ import annotations

import os
import random
from datetime import date, time, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from apps.bookings.models import Booking, BookingStatus
from apps.common.models import PlatformSetting
from apps.reviews.models import Review
from apps.stadiums.models import (
    Amenity,
    Favorite,
    FieldType,
    Stadium,
    StadiumStatus,
    StadiumWorkingHour,
)
from apps.users.models import OwnerProfile, Role, User, UserProfile

# The admin and owner usernames are editable from the admin panel, but their
# phone and email stay unique. Seeding therefore has to look them up by all
# three: matching on the username alone lets a renamed account fall through
# to create_*() and collide on the unique phone/email instead of updating.
ADMIN_USERNAME = "admin"
ADMIN_EMAIL = "admin@arena.uz"
ADMIN_PHONE = "+998900000000"

AMENITIES = [
    ("parking", "Parking", "Parkovka", "car", 1),
    ("shower", "Shower", "Dush", "shower", 2),
    ("locker", "Locker room", "Kiyinish xonasi", "lock", 3),
    ("lighting", "Floodlights", "Yoritish", "lightbulb", 4),
    ("tribune", "Stands", "Tribuna", "users", 5),
    ("wifi", "Wi-Fi", "Wi-Fi", "wifi", 6),
    ("cafe", "Cafe", "Kafe", "coffee", 7),
    ("ball", "Ball provided", "To'p beriladi", "circle", 8),
    ("referee", "Referee", "Hakam", "whistle", 9),
    ("cctv", "CCTV", "Videokuzatuv", "video", 10),
]

# name, city, district, address, lat, lon, field_type, price/hour, capacity
STADIUM_SEED = [
    ("Bunyodkor Arena", "Toshkent", "Chilonzor", "Bunyodkor shoh ko'chasi 1",
     41.2769, 69.2039, FieldType.F11, 350_000, 22),
    ("Milliy Stadion Mini", "Toshkent", "Yashnobod", "Bobur ko'chasi 45",
     41.2760, 69.3200, FieldType.F7, 250_000, 14),
    ("Yunusobod Sport Arena", "Toshkent", "Yunusobod", "Amir Temur shoh ko'chasi 108",
     41.3600, 69.2870, FieldType.F5, 180_000, 10),
    ("Chilonzor Futbol Maydoni", "Toshkent", "Chilonzor", "Qatortol ko'chasi 60",
     41.2830, 69.2040, FieldType.F5, 150_000, 10),
    ("Mirzo Ulug'bek Arena", "Toshkent", "Mirzo Ulug'bek", "Buyuk Ipak Yo'li 12",
     41.3250, 69.3350, FieldType.F7, 220_000, 14),
    ("Sergeli Green Field", "Toshkent", "Sergeli", "Yangi Sergeli 7-kvartal",
     41.2200, 69.2200, FieldType.MINI, 120_000, 8),
    ("Olmazor Champions", "Toshkent", "Olmazor", "Universitet ko'chasi 4",
     41.3450, 69.2100, FieldType.F5, 160_000, 10),
    ("Samarqand Registon Arena", "Samarqand", "Registon", "Registon ko'chasi 22",
     39.6547, 66.9597, FieldType.F7, 190_000, 14),
    ("Buxoro Sport Complex", "Buxoro", "Markaziy", "Mustaqillik ko'chasi 9",
     39.7680, 64.4210, FieldType.F5, 140_000, 10),
    ("Andijon Yoshlar Maydoni", "Andijon", "Markaziy", "Navoiy shoh ko'chasi 31",
     40.7830, 72.3440, FieldType.F5, 130_000, 10),
    ("Farg'ona Arena", "Farg'ona", "Markaziy", "Al-Farg'oniy ko'chasi 15",
     40.3860, 71.7870, FieldType.F7, 170_000, 14),
    ("Namangan Pro Field", "Namangan", "Markaziy", "Islom Karimov ko'chasi 3",
     41.0010, 71.6720, FieldType.MINI, 110_000, 8),
    ("Nukus Sport Arena", "Nukus", "Markaziy", "Do'stlik ko'chasi 55",
     42.4600, 59.6170, FieldType.F5, 120_000, 10),
    ("Qarshi Yangi Maydon", "Qarshi", "Markaziy", "Nasaf ko'chasi 18",
     38.8600, 65.7890, FieldType.F7, 150_000, 14),
    ("Termiz Janubiy Arena", "Termiz", "Markaziy", "Alpomish ko'chasi 2",
     37.2240, 67.2780, FieldType.F5, 125_000, 10),
]

OWNER_SEED = [
    ("owner_bunyodkor", "+998901112233", "Sardor", "Rahimov", "Bunyodkor Sport MCHJ"),
    ("owner_registon", "+998902223344", "Jasur", "Nazarov", "Registon Arena MCHJ"),
    ("owner_vodiy", "+998903334455", "Bekzod", "Yo'ldoshev", "Vodiy Sport Group"),
]

CUSTOMER_SEED = [
    ("+998911111101", "Aziz", "Karimov"),
    ("+998911111102", "Dilshod", "Tursunov"),
    ("+998911111103", "Kamola", "Sobirova"),
    ("+998911111104", "Otabek", "Ergashev"),
    ("+998911111105", "Nodira", "Yusupova"),
    ("+998911111106", "Shohruh", "Islomov"),
    ("+998911111107", "Malika", "Ahmedova"),
    ("+998911111108", "Javohir", "Qodirov"),
    ("+998911111109", "Sevara", "Nabieva"),
    ("+998911111110", "Ulug'bek", "Sattorov"),
]

REVIEW_COMMENTS = [
    "Maydon juda toza, yoritish zo'r. Yana kelamiz!",
    "Narxi sifatiga mos. Kiyinish xonasi biroz kichik.",
    "Egasi juda samimiy, hammasi vaqtida tayyor edi.",
    "Gazon yaxshi holatda, parkovka ham keng.",
    "Yaxshi maydon, lekin dush suvi sovuq edi.",
    "Do'stlar bilan zo'r o'ynadik, tavsiya qilaman.",
    "Joylashuvi qulay, yo'ldan topish oson.",
]


class Command(BaseCommand):
    help = "Seed the database with demo users, stadiums, bookings and reviews."

    def add_arguments(self, parser):
        parser.add_argument(
            "--flush", action="store_true",
            help="Delete bookings, reviews and stadiums before seeding.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        random.seed(20260101)  # deterministic demo data

        if options["flush"]:
            self.stdout.write("Flushing bookings, reviews and stadiums…")
            Review.objects.all().delete()
            Booking.objects.all().delete()
            Favorite.objects.all().delete()
            Stadium.objects.all().delete()

        PlatformSetting.load()
        amenities = self._seed_amenities()
        admin = self._seed_admin()
        owners = self._seed_owners(admin)
        customers = self._seed_customers()
        stadiums = self._seed_stadiums(owners, amenities, admin)
        self._seed_favorites(customers, stadiums)
        bookings = self._seed_bookings(customers, stadiums)
        self._seed_reviews(bookings)

        self.stdout.write(self.style.SUCCESS("\nSeed complete."))
        self.stdout.write(
            f"\n  Admin login:  {admin.username} / {self._admin_password()}"
        )
        self.stdout.write(
            "  Owner logins: {} (parol: {})".format(
                ", ".join(o.username for o in owners), self._owner_password()
            )
        )
        self.stdout.write(
            "  Mijozlar: telefon + OTP orqali kiradi, masalan {}\n"
            "            (dev rejimida OTP kod javobda qaytariladi)".format(
                CUSTOMER_SEED[0][0]
            )
        )
        self.stdout.write(
            "  Stadionlar: {} ta ({} tasdiqlangan)".format(
                Stadium.objects.count(),
                Stadium.objects.filter(status=StadiumStatus.APPROVED).count(),
            )
        )
        self.stdout.write("  Bronlar: {} ta, sharhlar: {} ta".format(
            Booking.objects.count(), Review.objects.count()
        ))

    # -- helpers ------------------------------------------------------------

    def _admin_password(self) -> str:
        return os.environ.get("SEED_ADMIN_PASSWORD", "Admin12345!")

    def _owner_password(self) -> str:
        return os.environ.get("SEED_OWNER_PASSWORD", "Owner12345!")

    def _seed_amenities(self) -> list[Amenity]:
        result = []
        for code, name, name_uz, icon, order in AMENITIES:
            amenity, _ = Amenity.objects.update_or_create(
                code=code,
                defaults={"name": name, "name_uz": name_uz, "icon": icon,
                          "sort_order": order},
            )
            result.append(amenity)
        self.stdout.write(f"  amenities: {len(result)}")
        return result

    def _seed_admin(self) -> User:
        admin = User.objects.filter(
            Q(username=ADMIN_USERNAME) | Q(email=ADMIN_EMAIL) | Q(phone=ADMIN_PHONE)
        ).first()
        if admin is None:
            admin = User.objects.create_superuser(
                username=ADMIN_USERNAME,
                password=self._admin_password(),
                email=ADMIN_EMAIL,
                phone=ADMIN_PHONE,
                first_name="Platform",
                last_name="Admin",
            )
        else:
            admin.set_password(self._admin_password())
            admin.save(update_fields=["password"])
        UserProfile.objects.get_or_create(user=admin)
        self.stdout.write("  admin: 1")
        return admin

    def _seed_owners(self, admin: User) -> list[User]:
        owners = []
        for index, (username, phone, first, last, company) in enumerate(OWNER_SEED):
            owner = User.objects.filter(
                Q(username=username)
                | Q(phone=phone)
                | Q(email=f"{username}@arena.uz")
            ).first()
            if owner is None:
                owner = User.objects.create_owner(
                    username=username,
                    password=self._owner_password(),
                    phone=phone,
                    email=f"{username}@arena.uz",
                    first_name=first,
                    last_name=last,
                    is_verified=True,
                )
            else:
                owner.set_password(self._owner_password())
                owner.save(update_fields=["password"])
            UserProfile.objects.get_or_create(user=owner)
            OwnerProfile.objects.update_or_create(
                user=owner,
                defaults={
                    "company_name": company,
                    "contact_phone": phone,
                    "contact_email": owner.email or "",
                    "tax_id": f"3010{index}5678",
                    # One owner gets a negotiated rate to exercise the override.
                    "commission_percent": Decimal("7.50") if index == 0 else None,
                    "created_by": admin,
                },
            )
            owners.append(owner)
        self.stdout.write(f"  owners: {len(owners)}")
        return owners

    def _seed_customers(self) -> list[User]:
        customers = []
        for phone, first, last in CUSTOMER_SEED:
            user = User.objects.filter(phone=phone).first()
            if user is None:
                user = User.objects.create_user(
                    phone=phone, first_name=first, last_name=last, is_verified=True
                )
            UserProfile.objects.get_or_create(user=user)
            customers.append(user)
        self.stdout.write(f"  customers: {len(customers)}")
        return customers

    def _seed_stadiums(self, owners, amenities, admin) -> list[Stadium]:
        stadiums = []
        for index, row in enumerate(STADIUM_SEED):
            (name, city, district, address, lat, lon, field_type,
             price, capacity) = row
            owner = owners[index % len(owners)]

            # 12 approved, 2 pending, 1 rejected — enough to exercise moderation.
            if index >= 14:
                status, note = StadiumStatus.REJECTED, "Rasmlar sifati past."
            elif index >= 12:
                status, note = StadiumStatus.PENDING, ""
            else:
                status, note = StadiumStatus.APPROVED, ""

            stadium, _ = Stadium.objects.update_or_create(
                owner=owner,
                name=name,
                defaults={
                    "description": (
                        f"{city} shahridagi zamonaviy {field_type} format maydon. "
                        "Sun'iy gazon, yoritish va kiyinish xonalari mavjud."
                    ),
                    "field_type": field_type,
                    "capacity": capacity,
                    "price_per_hour": Decimal(price),
                    "city": city,
                    "district": district,
                    "address": address,
                    "latitude": lat,
                    "longitude": lon,
                    "phone": owner.phone or "",
                    "status": status,
                    "moderation_note": note,
                    "reviewed_by": admin if status != StadiumStatus.PENDING else None,
                    "reviewed_at": (timezone.now()
                                    if status != StadiumStatus.PENDING else None),
                    "is_active": True,
                },
            )
            stadium.amenities.set(random.sample(amenities, random.randint(4, 8)))
            self._seed_working_hours(stadium)
            stadiums.append(stadium)

        self.stdout.write(f"  stadiums: {len(stadiums)}")
        return stadiums

    def _seed_working_hours(self, stadium: Stadium) -> None:
        for weekday in range(7):
            StadiumWorkingHour.objects.update_or_create(
                stadium=stadium,
                weekday=weekday,
                defaults={
                    "open_time": time(8, 0),
                    "close_time": time(23, 0) if weekday < 5 else time(0, 0),
                    "is_closed": False,
                },
            )

    def _seed_favorites(self, customers, stadiums) -> None:
        bookable = [s for s in stadiums if s.status == StadiumStatus.APPROVED]
        count = 0
        for customer in customers:
            for stadium in random.sample(bookable, random.randint(1, 4)):
                _, created = Favorite.objects.get_or_create(
                    user=customer, stadium=stadium
                )
                count += int(created)
        self.stdout.write(f"  favorites: {count}")

    def _seed_bookings(self, customers, stadiums) -> list[Booking]:
        """
        Built directly (not through create_booking) so we can plant historical
        rows in the past, which the service layer deliberately forbids.
        """
        bookable = [s for s in stadiums if s.status == StadiumStatus.APPROVED]
        config = PlatformSetting.load()
        today = timezone.localdate()
        bookings: list[Booking] = []

        # Rows already in the database block a slot exactly as much as the ones
        # this run creates -- unique_active_booking_slot and booking_no_overlap
        # both cover PENDING/APPROVED/COMPLETED. Seeding `taken` from them is
        # what makes a re-run idempotent: the RNG is seeded to a fixed value, so
        # a second run otherwise replays the same slots and collides with the
        # rows the first run inserted.
        blocking = (
            BookingStatus.PENDING,
            BookingStatus.APPROVED,
            BookingStatus.COMPLETED,
        )
        taken: set[tuple] = {
            (stadium_id, day, hour)
            for stadium_id, day, start, end in Booking.objects.filter(
                status__in=blocking
            ).values_list("stadium_id", "date", "start_time", "end_time")
            # `or 24` keeps a midnight end_time from producing an empty range.
            for hour in range(start.hour, end.hour or 24)
        }

        plan = (
            # (day offset range, status, how many)
            ((-45, -5), BookingStatus.COMPLETED, 40),
            ((-45, -5), BookingStatus.CANCELLED, 6),
            ((-45, -5), BookingStatus.REJECTED, 4),
            ((-30, -2), BookingStatus.EXPIRED, 4),
            ((1, 20), BookingStatus.APPROVED, 18),
            ((1, 20), BookingStatus.PENDING, 12),
        )

        # Top up to the plan's target per status rather than adding another full
        # batch, so a re-run against an already-seeded database creates nothing
        # instead of piling up a second set of demo bookings.
        existing = dict(
            Booking.objects.values_list("status")
            .annotate(n=Count("id"))
            .values_list("status", "n")
        )

        for (low, high), status, quantity in plan:
            shortfall = quantity - existing.get(status, 0)
            created = 0
            attempts = 0
            while created < shortfall and attempts < shortfall * 20:
                attempts += 1
                stadium = random.choice(bookable)
                day = today + timedelta(days=random.randint(low, high))
                start_hour = random.randint(8, 21)
                duration = random.choice([1, 1, 2, 2, 3])
                if start_hour + duration > 23:
                    continue
                # Respect unique_active_booking_slot for blocking statuses.
                if any((stadium.id, day, hour) in taken
                       for hour in range(start_hour, start_hour + duration)):
                    continue
                for hour in range(start_hour, start_hour + duration):
                    taken.add((stadium.id, day, hour))

                booking = self._make_booking(
                    customer=random.choice(customers),
                    stadium=stadium,
                    day=day,
                    start_hour=start_hour,
                    duration=duration,
                    status=status,
                    config=config,
                )
                bookings.append(booking)
                created += 1

        self.stdout.write(f"  bookings: {len(bookings)}")
        return bookings

    def _make_booking(self, *, customer, stadium, day: date, start_hour: int,
                      duration: int, status: str, config) -> Booking:
        profile = getattr(stadium.owner, "owner_profile", None)
        commission_percent = Decimal(
            profile.commission_percent
            if profile and profile.commission_percent is not None
            else config.commission_percent
        )
        total = (stadium.price_per_hour * duration).quantize(Decimal("0.01"))
        commission = (total * commission_percent / Decimal("100")).quantize(
            Decimal("0.01")
        )
        starts_at = timezone.make_aware(
            timezone.datetime.combine(day, time(start_hour, 0)),
            timezone.get_current_timezone(),
        )
        now = timezone.now()

        booking = Booking.objects.create(
            user=customer,
            owner=stadium.owner,
            stadium=stadium,
            date=day,
            start_time=time(start_hour, 0),
            end_time=time((start_hour + duration) % 24, 0),
            duration_hours=duration,
            starts_at=starts_at,
            ends_at=starts_at + timedelta(hours=duration),
            hourly_price=stadium.price_per_hour,
            total_price=total,
            commission_percent=commission_percent,
            commission_amount=commission,
            owner_earning=total - commission,
            status=status,
            contact_phone=customer.phone or "",
            players_count=random.choice([8, 10, 12, 14, 22]),
            customer_note=random.choice(
                ["", "", "Iltimos, to'p tayyorlab qo'ying.", "Do'stlar bilan o'ynaymiz."]
            ),
            approved_at=now if status in {BookingStatus.APPROVED,
                                          BookingStatus.COMPLETED} else None,
            rejected_at=now if status == BookingStatus.REJECTED else None,
            cancelled_at=now if status == BookingStatus.CANCELLED else None,
            completed_at=(starts_at + timedelta(hours=duration)
                          if status == BookingStatus.COMPLETED else None),
            rejection_reason=("Bu vaqt band bo'lib qoldi."
                              if status == BookingStatus.REJECTED else ""),
            cancellation_reason=("Rejalarim o'zgardi."
                                 if status == BookingStatus.CANCELLED else ""),
        )
        return booking

    def _seed_reviews(self, bookings) -> None:
        completed = [b for b in bookings if b.status == BookingStatus.COMPLETED]
        touched = set()
        count = 0
        for booking in completed:
            if random.random() > 0.7:  # ~70% of completed bookings get reviewed
                continue
            Review.objects.update_or_create(
                booking=booking,
                defaults={
                    "stadium": booking.stadium,
                    "user": booking.user,
                    "rating": random.choices([5, 4, 3, 2], weights=[55, 28, 12, 5])[0],
                    "comment": random.choice(REVIEW_COMMENTS),
                    "is_visible": True,
                },
            )
            touched.add(booking.stadium_id)
            count += 1

        for stadium in Stadium.objects.filter(id__in=touched):
            stadium.recalculate_rating()
        self.stdout.write(f"  reviews: {count}")
