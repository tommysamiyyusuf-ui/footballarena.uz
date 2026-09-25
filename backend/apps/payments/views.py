from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.bookings.models import Booking, BookingStatus
from apps.common.exceptions import DomainError
from apps.common.permissions import IsActiveUser
from apps.payments.gateways import get_gateway
from apps.payments.models import Payment, PaymentStatus
from apps.payments.serializers import PaymentCreateSerializer, PaymentSerializer


@extend_schema(tags=["payments"])
class PaymentViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin,
                     viewsets.GenericViewSet):
    """
    Payments are optional in the MVP: bookings settle in cash on site by default.
    The endpoints below are wired to the gateway interface so Click/Payme/Uzum can
    be switched on without changing the booking flow.
    """

    permission_classes = [IsActiveUser]
    serializer_class = PaymentSerializer
    queryset = Payment.objects.none()  # schema introspection only

    def get_queryset(self):
        user = self.request.user
        queryset = Payment.objects.select_related("booking", "booking__stadium")
        if user.role == "ADMIN":
            return queryset
        if user.role == "OWNER":
            return queryset.filter(booking__owner=user)
        return queryset.filter(user=user)

    @extend_schema(summary="Start a payment for a booking",
                   request=PaymentCreateSerializer, responses={201: dict})
    @action(detail=False, methods=["post"], url_path="initiate")
    @transaction.atomic
    def initiate(self, request):
        serializer = PaymentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        booking = Booking.objects.for_actor(request.user).filter(
            pk=data["booking_id"]
        ).first()
        if booking is None:
            raise DomainError("Bron topilmadi.")
        if booking.user_id != request.user.id:
            raise DomainError("Bu bron sizga tegishli emas.")
        if booking.status not in {BookingStatus.PENDING, BookingStatus.APPROVED}:
            raise DomainError("Bu bron uchun to'lov qilib bo'lmaydi.")
        if booking.payments.filter(status=PaymentStatus.PAID).exists():
            raise DomainError("Bu bron allaqachon to'langan.")

        payment = Payment.objects.create(
            booking=booking,
            user=request.user,
            amount=booking.total_price,
            currency=booking.currency,
            provider=data["provider"],
        )
        result = get_gateway(data["provider"]).create_invoice(payment)
        if result.get("transaction_id"):
            payment.transaction_id = result["transaction_id"]
            payment.save(update_fields=["transaction_id", "updated_at"])

        return Response(
            {"payment": PaymentSerializer(payment).data,
             "payment_url": result.get("payment_url", "")},
            status=status.HTTP_201_CREATED,
        )
