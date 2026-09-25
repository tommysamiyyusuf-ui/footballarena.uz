from rest_framework.permissions import SAFE_METHODS, BasePermission


class _RolePermission(BasePermission):
    role: str = ""
    message = "You do not have permission to perform this action."

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and not user.is_blocked
            and user.role == self.role
        )


class IsAdmin(_RolePermission):
    role = "ADMIN"
    message = "Only administrators can access this resource."


class IsOwner(_RolePermission):
    role = "OWNER"
    message = "Only stadium owners can access this resource."


class IsCustomer(_RolePermission):
    role = "USER"
    message = "Only customers can access this resource."


class IsAdminOrOwner(BasePermission):
    message = "Only administrators or stadium owners can access this resource."

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and not user.is_blocked
            and user.role in {"ADMIN", "OWNER"}
        )


class IsActiveUser(BasePermission):
    message = "Your account has been blocked."

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and not user.is_blocked)


class ReadOnly(BasePermission):
    def has_permission(self, request, view) -> bool:
        return request.method in SAFE_METHODS


class IsStadiumOwnerOrAdmin(BasePermission):
    """Object-level: the stadium belongs to the requesting owner, or admin."""

    message = "You can only manage your own stadiums."

    def has_object_permission(self, request, view, obj) -> bool:
        user = request.user
        if not user.is_authenticated:
            return False
        if user.role == "ADMIN":
            return True
        owner_id = getattr(obj, "owner_id", None)
        return owner_id is not None and owner_id == user.id
