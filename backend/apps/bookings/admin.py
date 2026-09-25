from django.contrib import admin

from apps.bookings.models import Booking, BookingStatusHistory


class StatusHistoryInline(admin.TabularInline):
    model = BookingStatusHistory
    extra = 0
    readonly_fields = ("from_status", "to_status", "changed_by", "note", "created_at")


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ("reference", "stadium", "user", "date", "start_time", "end_time",
                    "total_price", "status")
    list_filter = ("status", "date", "stadium__city")
    search_fields = ("reference", "stadium__name", "user__phone", "user__first_name")
    readonly_fields = ("id", "reference", "created_at", "updated_at", "starts_at", "ends_at")
    date_hierarchy = "date"
    inlines = [StatusHistoryInline]
