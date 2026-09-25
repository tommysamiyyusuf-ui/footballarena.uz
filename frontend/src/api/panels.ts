import { api } from "@/lib/api";
import type {
  AdminBooking,
  AdminDashboard,
  AdminFinance,
  AdminOwner,
  AdminStatistics,
  AdminUser,
  AuditLogEntry,
  ModerationAction,
  OwnerCalendar,
  OwnerDashboard,
  OwnerStatistics,
  Paginated,
  PlatformSettings,
  Review,
  StadiumDetail,
} from "@/types/api";

export const ownerApi = {
  dashboard: async () => (await api.get<OwnerDashboard>("/owner/dashboard/")).data,

  statistics: async (params: { days?: number; stadium?: string } = {}) =>
    (await api.get<OwnerStatistics>("/owner/statistics/", { params })).data,

  calendar: async (params: { year: number; month: number; stadium?: string }) =>
    (await api.get<OwnerCalendar>("/owner/calendar/", { params })).data,
};

export interface OwnerCreatePayload {
  first_name: string;
  last_name?: string;
  phone: string;
  email?: string;
  username: string;
  password: string;
  company_name?: string;
  tax_id?: string;
  commission_percent?: string;
  notes?: string;
}

export const adminApi = {
  dashboard: async () => (await api.get<AdminDashboard>("/admin-panel/dashboard/")).data,

  statistics: async (days = 30) =>
    (await api.get<AdminStatistics>("/admin-panel/statistics/", { params: { days } })).data,

  finance: async (params: { date_from?: string; date_to?: string } = {}) =>
    (await api.get<AdminFinance>("/admin-panel/finance/", { params })).data,

  users: async (params: { search?: string; status?: string; page?: number } = {}) =>
    (await api.get<Paginated<AdminUser>>("/admin-panel/users/", { params })).data,

  blockUser: async (id: string, reason: string) =>
    (await api.post(`/admin-panel/users/${id}/block/`, { reason })).data,

  unblockUser: async (id: string) =>
    (await api.post(`/admin-panel/users/${id}/unblock/`)).data,

  userBookings: async (id: string, page = 1) =>
    (await api.get<Paginated<AdminBooking>>(`/admin-panel/users/${id}/bookings/`, {
      params: { page },
    })).data,

  owners: async (params: { search?: string; status?: string; page?: number } = {}) =>
    (await api.get<Paginated<AdminOwner>>("/admin-panel/owners/", { params })).data,

  createOwner: async (payload: OwnerCreatePayload) =>
    (await api.post<AdminOwner>("/admin-panel/owners/", payload)).data,

  updateOwner: async (id: string, payload: Partial<OwnerCreatePayload>) =>
    (await api.patch<AdminOwner>(`/admin-panel/owners/${id}/`, payload)).data,

  deleteOwner: async (id: string) => {
    await api.delete(`/admin-panel/owners/${id}/`);
  },

  blockOwner: async (id: string, reason: string) =>
    (await api.post(`/admin-panel/owners/${id}/block/`, { reason })).data,

  unblockOwner: async (id: string) =>
    (await api.post(`/admin-panel/owners/${id}/unblock/`)).data,

  stadiums: async (
    params: { status?: string; owner?: string; search?: string; page?: number } = {},
  ) => (await api.get<Paginated<StadiumDetail>>("/admin-panel/stadiums/", { params })).data,

  pendingStadiums: async (page = 1) =>
    (await api.get<Paginated<StadiumDetail>>("/admin-panel/stadiums/pending/", {
      params: { page },
    })).data,

  moderateStadium: async (id: string, action: ModerationAction, note = "") =>
    (await api.post<StadiumDetail>(`/admin-panel/stadiums/${id}/moderate/`, { action, note }))
      .data,

  bookings: async (
    params: {
      status?: string;
      stadium?: string;
      owner?: string;
      user?: string;
      date_from?: string;
      date_to?: string;
      search?: string;
      page?: number;
    } = {},
  ) => (await api.get<Paginated<AdminBooking>>("/admin-panel/bookings/", { params })).data,

  reviews: async (
    params: { visible?: string; stadium?: string; rating?: string; page?: number } = {},
  ) => (await api.get<Paginated<Review>>("/admin-panel/reviews/", { params })).data,

  hideReview: async (id: string, reason: string) =>
    (await api.post<Review>(`/admin-panel/reviews/${id}/hide/`, { reason })).data,

  restoreReview: async (id: string) =>
    (await api.post<Review>(`/admin-panel/reviews/${id}/restore/`)).data,

  settings: async () => (await api.get<PlatformSettings>("/admin-panel/settings/")).data,

  updateSettings: async (payload: Partial<PlatformSettings>) =>
    (await api.patch<PlatformSettings>("/admin-panel/settings/", payload)).data,

  auditLogs: async (params: { action?: string; days?: string; page?: number } = {}) =>
    (await api.get<Paginated<AuditLogEntry>>("/admin-panel/audit-logs/", { params })).data,
};
