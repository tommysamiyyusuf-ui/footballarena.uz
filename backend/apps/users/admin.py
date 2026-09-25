from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from apps.users.models import OTPCode, OwnerProfile, User, UserProfile


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("id", "get_full_name", "phone", "username", "email", "role",
                    "is_blocked", "created_at")
    list_filter = ("role", "is_blocked", "is_active", "is_verified")
    search_fields = ("phone", "username", "email", "first_name", "last_name")
    ordering = ("-created_at",)
    readonly_fields = ("id", "created_at", "updated_at", "last_login")
    filter_horizontal = ("groups", "user_permissions")
    fieldsets = (
        (None, {"fields": ("id", "username", "password")}),
        ("Identity", {"fields": ("phone", "email", "first_name", "last_name", "avatar",
                                 "google_id", "telegram_id", "telegram_username")}),
        ("Access", {"fields": ("role", "is_active", "is_verified", "is_blocked",
                               "blocked_reason", "is_staff", "is_superuser",
                               "groups", "user_permissions")}),
        ("Timestamps", {"fields": ("last_login", "created_at", "updated_at")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",),
                "fields": ("username", "phone", "email", "role", "password1", "password2")}),
    )


admin.site.register(UserProfile)
admin.site.register(OwnerProfile)
admin.site.register(OTPCode)
