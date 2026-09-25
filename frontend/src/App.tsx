import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { RedirectIfAuthenticated, RequireRole } from "@/components/RouteGuards";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { MainLayout } from "@/components/layout/MainLayout";
import { OwnerLayout } from "@/components/layout/OwnerLayout";
import { useNotificationSocket } from "@/hooks/useNotificationSocket";
import { AdminAuditPage } from "@/pages/admin/AdminAuditPage";
import { AdminBookingsPage } from "@/pages/admin/AdminBookingsPage";
import { AdminDashboardPage } from "@/pages/admin/AdminDashboardPage";
import { AdminFinancePage } from "@/pages/admin/AdminFinancePage";
import { AdminModerationPage } from "@/pages/admin/AdminModerationPage";
import { AdminOwnersPage } from "@/pages/admin/AdminOwnersPage";
import { AdminReviewsPage } from "@/pages/admin/AdminReviewsPage";
import { AdminSettingsPage } from "@/pages/admin/AdminSettingsPage";
import { AdminStadiumsPage } from "@/pages/admin/AdminStadiumsPage";
import { AdminStatisticsPage } from "@/pages/admin/AdminStatisticsPage";
import { AdminUsersPage } from "@/pages/admin/AdminUsersPage";
import { LoginPage } from "@/pages/auth/LoginPage";
import { YandexCallbackPage } from "@/pages/auth/YandexCallbackPage";
import { ChatRoomPage } from "@/pages/chat/ChatRoomPage";
import { ConversationsPage } from "@/pages/chat/ConversationsPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { OwnerBookingsPage } from "@/pages/owner/OwnerBookingsPage";
import { OwnerCalendarPage } from "@/pages/owner/OwnerCalendarPage";
import { OwnerDashboardPage } from "@/pages/owner/OwnerDashboardPage";
import { OwnerProfilePage } from "@/pages/owner/OwnerProfilePage";
import { OwnerReviewsPage } from "@/pages/owner/OwnerReviewsPage";
import { OwnerStadiumFormPage } from "@/pages/owner/OwnerStadiumFormPage";
import { OwnerStadiumsPage } from "@/pages/owner/OwnerStadiumsPage";
import { OwnerStatisticsPage } from "@/pages/owner/OwnerStatisticsPage";
import { BookingDetailPage } from "@/pages/user/BookingDetailPage";
import { BookingPage } from "@/pages/user/BookingPage";
import { FavoritesPage } from "@/pages/user/FavoritesPage";
import { HomePage } from "@/pages/user/HomePage";
import { MyBookingsPage } from "@/pages/user/MyBookingsPage";
import { NotificationsPage } from "@/pages/user/NotificationsPage";
import { ProfilePage } from "@/pages/user/ProfilePage";
import { StadiumDetailPage } from "@/pages/user/StadiumDetailPage";
import { useAuthStore } from "@/stores/auth";

/** Probes the session once on boot and keeps the live socket attached. */
function useSession() {
  const refreshUser = useAuthStore((state) => state.refreshUser);
  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);
  useNotificationSocket();
}

export default function App() {
  useSession();

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfAuthenticated>
            <LoginPage />
          </RedirectIfAuthenticated>
        }
      />

      {/* Where Yandex's OAuth popup lands; it closes itself straight away, so
          it must stay outside RedirectIfAuthenticated. */}
      <Route path="/auth/yandex" element={<YandexCallbackPage />} />

      {/* Public catalogue + everything a signed-in customer uses. */}
      <Route element={<MainLayout />}>
        <Route index element={<HomePage />} />
        <Route path="stadiums/:id" element={<StadiumDetailPage />} />

        <Route
          path="stadiums/:id/book"
          element={
            <RequireRole roles={["USER"]}>
              <BookingPage />
            </RequireRole>
          }
        />
        <Route
          path="bookings"
          element={
            <RequireRole roles={["USER"]}>
              <MyBookingsPage />
            </RequireRole>
          }
        />
        <Route
          path="bookings/:id"
          element={
            <RequireRole roles={["USER"]}>
              <BookingDetailPage />
            </RequireRole>
          }
        />
        <Route
          path="favorites"
          element={
            <RequireRole roles={["USER"]}>
              <FavoritesPage />
            </RequireRole>
          }
        />
        <Route
          path="chat"
          element={
            <RequireRole roles={["USER"]}>
              <ConversationsPage basePath="/chat" />
            </RequireRole>
          }
        />
        <Route
          path="chat/:id"
          element={
            <RequireRole roles={["USER"]}>
              <ChatRoomPage backTo="/chat" />
            </RequireRole>
          }
        />
        <Route
          path="notifications"
          element={
            <RequireRole roles={["USER", "OWNER", "ADMIN"]}>
              <NotificationsPage />
            </RequireRole>
          }
        />
        <Route
          path="profile"
          element={
            <RequireRole roles={["USER"]}>
              <ProfilePage />
            </RequireRole>
          }
        />
      </Route>

      <Route
        path="/owner"
        element={
          <RequireRole roles={["OWNER"]}>
            <OwnerLayout />
          </RequireRole>
        }
      >
        <Route index element={<OwnerDashboardPage />} />
        <Route path="stadiums" element={<OwnerStadiumsPage />} />
        <Route path="stadiums/new" element={<OwnerStadiumFormPage />} />
        <Route path="stadiums/:id" element={<OwnerStadiumFormPage />} />
        <Route path="bookings" element={<OwnerBookingsPage />} />
        <Route path="calendar" element={<OwnerCalendarPage />} />
        <Route path="statistics" element={<OwnerStatisticsPage />} />
        <Route path="reviews" element={<OwnerReviewsPage />} />
        <Route path="chat" element={<ConversationsPage basePath="/owner/chat" />} />
        <Route path="chat/:id" element={<ChatRoomPage backTo="/owner/chat" />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<OwnerProfilePage />} />
      </Route>

      <Route
        path="/admin"
        element={
          <RequireRole roles={["ADMIN"]}>
            <AdminLayout />
          </RequireRole>
        }
      >
        <Route index element={<AdminDashboardPage />} />
        <Route path="moderation" element={<AdminModerationPage />} />
        <Route path="stadiums" element={<AdminStadiumsPage />} />
        <Route path="owners" element={<AdminOwnersPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="bookings" element={<AdminBookingsPage />} />
        <Route path="reviews" element={<AdminReviewsPage />} />
        <Route path="finance" element={<AdminFinancePage />} />
        <Route path="statistics" element={<AdminStatisticsPage />} />
        <Route path="audit" element={<AdminAuditPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
      </Route>

      <Route path="/index.html" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
