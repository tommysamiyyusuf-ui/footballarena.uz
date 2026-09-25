from rest_framework import serializers

from apps.payments.models import Payment, PaymentProvider, Payout


class PaymentSerializer(serializers.ModelSerializer):
    booking_reference = serializers.CharField(source="booking.reference", read_only=True)
    stadium_name = serializers.CharField(source="booking.stadium.name", read_only=True)

    class Meta:
        model = Payment
        fields = ("id", "booking", "booking_reference", "stadium_name", "amount",
                  "currency", "provider", "status", "transaction_id", "paid_at",
                  "failure_reason", "created_at")
        read_only_fields = fields


class PaymentCreateSerializer(serializers.Serializer):
    booking_id = serializers.UUIDField()
    provider = serializers.ChoiceField(choices=PaymentProvider.choices,
                                       default=PaymentProvider.CASH)


class PayoutSerializer(serializers.ModelSerializer):
    owner_name = serializers.SerializerMethodField()

    class Meta:
        model = Payout
        fields = ("id", "owner", "owner_name", "period_start", "period_end",
                  "gross_amount", "commission_amount", "net_amount", "currency",
                  "status", "note", "paid_at", "created_at")
        read_only_fields = ("id", "created_at")

    def get_owner_name(self, obj) -> str:
        return obj.owner.get_full_name() or obj.owner.username or str(obj.owner_id)
