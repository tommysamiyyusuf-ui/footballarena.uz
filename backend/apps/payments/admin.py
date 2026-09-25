from django.contrib import admin

from apps.payments.models import Payment, Payout


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ("created_at", "booking", "user", "amount", "currency", "provider",
                    "status")
    list_filter = ("provider", "status", "created_at")
    search_fields = ("transaction_id", "booking__reference", "user__phone")
    autocomplete_fields = ("booking", "user")
    readonly_fields = ("created_at", "updated_at", "provider_payload")
    date_hierarchy = "created_at"


@admin.register(Payout)
class PayoutAdmin(admin.ModelAdmin):
    list_display = ("period_start", "period_end", "owner", "gross_amount",
                    "commission_amount", "net_amount", "status")
    list_filter = ("status",)
    search_fields = ("owner__username", "owner__phone")
    autocomplete_fields = ("owner",)
    readonly_fields = ("created_at", "updated_at")
