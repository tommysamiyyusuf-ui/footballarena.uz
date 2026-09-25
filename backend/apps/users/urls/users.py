from django.urls import path

from apps.users.views import ChangePasswordView, MeView

urlpatterns = [
    path("me/", MeView.as_view(), name="users-me"),
    path("me/password/", ChangePasswordView.as_view(), name="users-change-password"),
]
