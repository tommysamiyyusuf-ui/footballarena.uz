from django.contrib import admin

from apps.chat.models import Conversation, Message


class MessageInline(admin.TabularInline):
    model = Message
    extra = 0
    fields = ("sender", "text", "is_read", "created_at")
    readonly_fields = ("created_at",)


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ("created_at", "customer", "owner", "stadium", "last_message_at",
                    "is_archived")
    list_filter = ("is_archived", "created_at")
    search_fields = ("customer__phone", "owner__username", "stadium__name")
    autocomplete_fields = ("customer", "owner", "stadium", "booking")
    readonly_fields = ("created_at", "updated_at")
    inlines = [MessageInline]


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("created_at", "conversation", "sender", "is_read")
    list_filter = ("is_read", "created_at")
    search_fields = ("text",)
    autocomplete_fields = ("conversation", "sender")
    readonly_fields = ("created_at", "updated_at")
