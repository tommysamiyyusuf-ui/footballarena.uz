from __future__ import annotations

from django.utils import timezone
from drf_spectacular.utils import OpenApiExample, extend_schema
from rest_framework import status
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from apps.common.exceptions import DomainError
from apps.common.utils import client_ip
from apps.users.models import OTPCode, UserProfile
from apps.users.serializers import (
    ChangePasswordSerializer,
    CompleteRegistrationSerializer,
    GoogleAuthSerializer,
    LogoutSerializer,
    MeSerializer,
    PasswordLoginSerializer,
    RequestOTPSerializer,
    TelegramAuthSerializer,
    UpdateMeSerializer,
    VerifyOTPSerializer,
    YandexAuthSerializer,
)
from apps.users.services import (
    issue_tokens,
    login_or_register_by_phone,
    login_or_register_with_google,
    login_or_register_with_telegram,
    login_or_register_with_yandex,
    request_otp,
    verify_otp,
)


def auth_response(user, *, created: bool = False, status_code: int = status.HTTP_200_OK):
    user.last_seen_at = timezone.now()
    user.save(update_fields=["last_seen_at", "updated_at"])
    return Response(
        {
            "success": True,
            "is_new_user": created,
            "tokens": issue_tokens(user),
            "user": MeSerializer(user).data,
        },
        status=status_code,
    )


@extend_schema(tags=["auth"])
class RequestOTPView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_scope = "otp_request"

    @extend_schema(
        summary="Send an SMS one-time password",
        request=RequestOTPSerializer,
        responses={200: dict},
        examples=[OpenApiExample("Request", value={"phone": "+998901234567"})],
    )
    def post(self, request):
        serializer = RequestOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = request_otp(serializer.validated_data["phone"], ip=client_ip(request))
        return Response({"success": True, **result})


@extend_schema(tags=["auth"])
class VerifyOTPView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_scope = "otp_verify"

    @extend_schema(
        summary="Verify the SMS code and sign in",
        description=(
            "Existing customers receive JWT tokens immediately. Brand-new numbers "
            "receive a short-lived `verification_token` to be exchanged at "
            "`/api/auth/phone/complete/` once the profile form is filled in."
        ),
        request=VerifyOTPSerializer,
        responses={200: dict},
    )
    def post(self, request):
        serializer = VerifyOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        otp = verify_otp(data["phone"], data["code"])
        from apps.users.models import User

        is_new = not User.objects.filter(phone=otp.phone).exists()
        if is_new:
            token = otp.issue_verification_token()
            return Response(
                {
                    "success": True,
                    "registration_required": True,
                    "verification_token": token,
                    "phone": otp.phone,
                }
            )

        user, created = login_or_register_by_phone(otp)
        response = auth_response(user, created=created)
        response.data["registration_required"] = False
        return response


@extend_schema(tags=["auth"])
class CompleteRegistrationView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    throttle_scope = "otp_verify"

    @extend_schema(
        summary="Finish sign-up for a freshly verified phone number",
        request=CompleteRegistrationSerializer,
        responses={201: dict},
    )
    def post(self, request):
        serializer = CompleteRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        otp = OTPCode.objects.filter(
            verification_token=data["verification_token"]
        ).order_by("-created_at").first()
        if otp is None or not otp.verification_token_expires_at:
            raise DomainError("Tasdiqlash tokeni yaroqsiz.")
        if timezone.now() >= otp.verification_token_expires_at:
            raise DomainError("Tasdiqlash tokeni muddati tugagan. Qaytadan boshlang.")

        user, created = login_or_register_by_phone(otp)
        user.first_name = data["first_name"]
        user.last_name = data.get("last_name", "")
        if data.get("avatar"):
            user.avatar = data["avatar"]
        user.save(update_fields=["first_name", "last_name", "avatar", "updated_at"])

        # Burn the token so it cannot be replayed.
        otp.verification_token = ""
        otp.verification_token_expires_at = None
        otp.save(update_fields=["verification_token", "verification_token_expires_at",
                                "updated_at"])

        return auth_response(user, created=created, status_code=status.HTTP_201_CREATED)


@extend_schema(tags=["auth"])
class GoogleAuthView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_scope = "login"

    @extend_schema(summary="Sign in with Google", request=GoogleAuthSerializer,
                   responses={200: dict})
    def post(self, request):
        serializer = GoogleAuthSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user, created = login_or_register_with_google(
            id_token=data.get("id_token", ""),
            code=data.get("code", ""),
            redirect_uri=data.get("redirect_uri") or None,
        )
        return auth_response(user, created=created)


@extend_schema(tags=["auth"])
class YandexAuthView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_scope = "login"

    @extend_schema(summary="Sign in with Yandex", request=YandexAuthSerializer,
                   responses={200: dict})
    def post(self, request):
        serializer = YandexAuthSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user, created = login_or_register_with_yandex(
            access_token=data.get("access_token", ""),
            code=data.get("code", ""),
            redirect_uri=data.get("redirect_uri") or None,
        )
        return auth_response(user, created=created)


@extend_schema(tags=["auth"])
class TelegramAuthView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_scope = "login"

    @extend_schema(summary="Sign in with the Telegram Login Widget",
                   request=TelegramAuthSerializer, responses={200: dict})
    def post(self, request):
        serializer = TelegramAuthSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = {k: v for k, v in serializer.validated_data.items() if v not in ("", None)}
        user, created = login_or_register_with_telegram(payload)
        return auth_response(user, created=created)


@extend_schema(tags=["auth"])
class PasswordLoginView(APIView):
    """Admin and owner login with username (or email) + password."""

    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_scope = "login"

    @extend_schema(summary="Sign in with username and password",
                   request=PasswordLoginSerializer, responses={200: dict})
    def post(self, request):
        serializer = PasswordLoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        return auth_response(serializer.validated_data["user"])


@extend_schema(tags=["auth"])
class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Blacklist the supplied refresh token",
                   request=LogoutSerializer, responses={205: None})
    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        refresh = serializer.validated_data["refresh"]
        try:
            RefreshToken(refresh).blacklist()
        except TokenError as exc:
            raise DomainError("Refresh token yaroqsiz.") from exc
        return Response(status=status.HTTP_205_RESET_CONTENT)


@extend_schema(tags=["users"])
class MeView(RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_object(self):
        user = self.request.user
        UserProfile.objects.get_or_create(user=user)
        return user

    def get_serializer_class(self):
        return MeSerializer if self.request.method == "GET" else UpdateMeSerializer

    def update(self, request, *args, **kwargs):
        super().update(request, *args, **kwargs)
        return Response(MeSerializer(self.get_object()).data)


@extend_schema(tags=["users"])
class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Change the account password",
                   request=ChangePasswordSerializer, responses={200: dict})
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password", "updated_at"])
        return Response({"success": True, "message": "Parol yangilandi."})
