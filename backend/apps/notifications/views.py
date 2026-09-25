from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.common.permissions import IsActiveUser
from apps.notifications.models import Notification
from apps.notifications.serializers import NotificationSerializer


@extend_schema(tags=["notifications"])
class NotificationViewSet(mixins.ListModelMixin, mixins.DestroyModelMixin,
                          viewsets.GenericViewSet):
    permission_classes = [IsActiveUser]
    serializer_class = NotificationSerializer
    queryset = Notification.objects.none()  # schema introspection only

    def get_queryset(self):
        queryset = Notification.objects.filter(recipient=self.request.user)
        if self.request.query_params.get("unread") == "true":
            queryset = queryset.filter(is_read=False)
        return queryset

    @extend_schema(summary="Unread notification count", responses={200: dict})
    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        count = Notification.objects.filter(recipient=request.user, is_read=False).count()
        return Response({"count": count})

    @extend_schema(summary="Mark one notification as read", request=None)
    @action(detail=True, methods=["post"], url_path="read")
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        if not notification.is_read:
            notification.is_read = True
            notification.read_at = timezone.now()
            notification.save(update_fields=["is_read", "read_at", "updated_at"])
        return Response(NotificationSerializer(notification).data)

    @extend_schema(summary="Mark every notification as read", request=None)
    @action(detail=False, methods=["post"], url_path="read-all")
    def mark_all_read(self, request):
        updated = Notification.objects.filter(
            recipient=request.user, is_read=False
        ).update(is_read=True, read_at=timezone.now())
        return Response({"updated": updated})

    @extend_schema(summary="Delete every notification", request=None)
    @action(detail=False, methods=["delete"], url_path="clear")
    def clear(self, request):
        Notification.objects.filter(recipient=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
