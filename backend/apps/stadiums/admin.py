from django.contrib import admin

from apps.stadiums.models import (
    Amenity,
    Favorite,
    Stadium,
    StadiumBlackout,
    StadiumImage,
    StadiumWorkingHour,
)


class StadiumImageInline(admin.TabularInline):
    model = StadiumImage
    extra = 0


class WorkingHourInline(admin.TabularInline):
    model = StadiumWorkingHour
    extra = 0


@admin.register(Stadium)
class StadiumAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "city", "district", "price_per_hour", "status",
                    "is_active", "rating", "created_at")
    list_filter = ("status", "is_active", "field_type", "city")
    search_fields = ("name", "address", "city", "district", "owner__username")
    readonly_fields = ("id", "created_at", "updated_at", "rating", "review_count")
    inlines = [StadiumImageInline, WorkingHourInline]
    filter_horizontal = ("amenities",)


admin.site.register(Amenity)
admin.site.register(StadiumBlackout)
admin.site.register(Favorite)
