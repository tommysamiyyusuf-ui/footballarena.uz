from django.contrib import admin

from apps.notifications.models import Notification, NotificationDelivery


class NotificationDeliveryInline(admin.TabularInline):
    model = NotificationDelivery
    extra = 0
    readonly_fields = ("channel", "status", "error", "sent_at", "created_at")
    can_delete = False


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("created_at", "type", "recipient", "title", "is_read")
    list_filter = ("type", "is_read", "created_at")
    search_fields = ("title", "message", "recipient__phone", "recipient__username")
    readonly_fields = ("created_at", "updated_at", "read_at")
    autocomplete_fields = ("recipient",)
    inlines = [NotificationDeliveryInline]
    date_hierarchy = "created_at"


@admin.register(NotificationDelivery)
class NotificationDeliveryAdmin(admin.ModelAdmin):
    list_display = ("created_at", "channel", "status", "notification", "sent_at")
    list_filter = ("channel", "status")
    readonly_fields = ("created_at", "updated_at")
