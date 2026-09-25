from rest_framework import serializers

from apps.common.models import AuditLog, PlatformSetting


class AuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = (
            "id",
            "actor",
            "actor_name",
            "action",
            "target_type",
            "target_id",
            "description",
            "metadata",
            "ip_address",
            "created_at",
        )
        read_only_fields = fields

    def get_actor_name(self, obj) -> str:
        return obj.actor.get_full_name() if obj.actor else "System"


class PlatformSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlatformSetting
        exclude = ("id",)

    def validate_commission_percent(self, value):
        if not (0 <= value <= 50):
            raise serializers.ValidationError("Komissiya 0-50% oralig'ida bo'lishi kerak.")
        return value

    def validate(self, attrs):
        minimum = attrs.get("booking_min_duration_hours",
                            getattr(self.instance, "booking_min_duration_hours", 1))
        maximum = attrs.get("booking_max_duration_hours",
                            getattr(self.instance, "booking_max_duration_hours", 6))
        if minimum > maximum:
            raise serializers.ValidationError(
                {"booking_min_duration_hours": "Minimal davomiylik maksimaldan katta bo'lolmaydi."}
            )
        return attrs
