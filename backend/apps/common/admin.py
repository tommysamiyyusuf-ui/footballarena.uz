from django.contrib import admin

from apps.common.models import AuditLog, PlatformSetting


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("created_at", "action", "actor", "target_type", "target_id")
    list_filter = ("action", "created_at")
    search_fields = ("target_id", "description", "actor__username", "actor__phone")
    readonly_fields = [field.name for field in AuditLog._meta.fields]
    date_hierarchy = "created_at"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(PlatformSetting)
class PlatformSettingAdmin(admin.ModelAdmin):
    list_display = ("platform_name", "commission_percent", "maintenance_mode")

    def has_add_permission(self, request):
        # Singleton — the row is created on demand by PlatformSetting.load().
        return not PlatformSetting.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
