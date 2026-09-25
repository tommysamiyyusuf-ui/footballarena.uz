from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView, TokenVerifyView

from apps.users.views import (
    CompleteRegistrationView,
    GoogleAuthView,
    LogoutView,
    PasswordLoginView,
    RequestOTPView,
    TelegramAuthView,
    VerifyOTPView,
    YandexAuthView,
)

urlpatterns = [
    path("phone/request-otp/", RequestOTPView.as_view(), name="auth-request-otp"),
    path("phone/verify/", VerifyOTPView.as_view(), name="auth-verify-otp"),
    path("phone/complete/", CompleteRegistrationView.as_view(), name="auth-complete"),
    path("google/", GoogleAuthView.as_view(), name="auth-google"),
    path("yandex/", YandexAuthView.as_view(), name="auth-yandex"),
    path("telegram/", TelegramAuthView.as_view(), name="auth-telegram"),
    path("login/", PasswordLoginView.as_view(), name="auth-password-login"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("token/verify/", TokenVerifyView.as_view(), name="token-verify"),
]
