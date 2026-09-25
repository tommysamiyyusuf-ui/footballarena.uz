from django.contrib import admin

from apps.reviews.models import Review


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ("created_at", "stadium", "user", "rating", "is_visible")
    list_filter = ("rating", "is_visible", "created_at")
    search_fields = ("comment", "stadium__name", "user__phone")
    autocomplete_fields = ("booking", "stadium", "user")
    readonly_fields = ("created_at", "updated_at", "owner_replied_at")
    date_hierarchy = "created_at"

    @admin.action(description="Hide selected reviews")
    def hide_reviews(self, request, queryset):
        queryset.update(is_visible=False)
        for stadium in {review.stadium for review in queryset}:
            stadium.recalculate_rating()

    @admin.action(description="Restore selected reviews")
    def restore_reviews(self, request, queryset):
        queryset.update(is_visible=True)
        for stadium in {review.stadium for review in queryset}:
            stadium.recalculate_rating()

    actions = ["hide_reviews", "restore_reviews"]
