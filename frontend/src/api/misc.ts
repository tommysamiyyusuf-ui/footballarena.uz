import { api } from "@/lib/api";
import type {
  AppNotification,
  ChatMessage,
  Conversation,
  Favorite,
  Paginated,
  Payment,
  Review,
} from "@/types/api";

export const favoritesApi = {
  list: async (page = 1) =>
    (await api.get<Paginated<Favorite>>("/favorites/", { params: { page } })).data,

  toggle: async (stadiumId: string) =>
    (await api.post<{ is_favorite: boolean }>(`/favorites/${stadiumId}/toggle/`)).data,
};

export const reviewsApi = {
  list: async (params: { stadium?: string; page?: number } = {}) =>
    (await api.get<Paginated<Review>>("/reviews/", { params })).data,

  create: async (payload: { booking: string; rating: number; comment?: string }) =>
    (await api.post<Review>("/reviews/", payload)).data,

  update: async (id: string, payload: { rating?: number; comment?: string }) =>
    (await api.patch<Review>(`/reviews/${id}/`, payload)).data,

  remove: async (id: string) => {
    await api.delete(`/reviews/${id}/`);
  },

  reply: async (id: string, reply: string) =>
    (await api.post<Review>(`/reviews/${id}/reply/`, { reply })).data,
};

export const notificationsApi = {
  list: async (page = 1) =>
    (await api.get<Paginated<AppNotification>>("/notifications/", { params: { page } })).data,

  unreadCount: async () =>
    (await api.get<{ count: number }>("/notifications/unread-count/")).data,

  markRead: async (id: string) =>
    (await api.post<AppNotification>(`/notifications/${id}/read/`)).data,

  markAllRead: async () => (await api.post("/notifications/read-all/")).data,

  clear: async () => (await api.post("/notifications/clear/")).data,
};

export const chatApi = {
  conversations: async (page = 1) =>
    (await api.get<Paginated<Conversation>>("/chat/", { params: { page } })).data,

  detail: async (id: string) => (await api.get<Conversation>(`/chat/${id}/`)).data,

  messages: async (id: string, page = 1) =>
    (await api.get<Paginated<ChatMessage>>(`/chat/${id}/messages/`, { params: { page } })).data,

  send: async (id: string, text: string) =>
    (await api.post<ChatMessage>(`/chat/${id}/send/`, { text })).data,

  start: async (payload: { stadium_id: string; booking_id?: string; text?: string }) =>
    (await api.post<Conversation>("/chat/start/", payload)).data,

  unreadCount: async () => (await api.get<{ count: number }>("/chat/unread-count/")).data,
};

export const paymentsApi = {
  list: async (page = 1) =>
    (await api.get<Paginated<Payment>>("/payments/", { params: { page } })).data,

  initiate: async (bookingId: string, provider: string) =>
    (await api.post<Payment>("/payments/initiate/", {
      booking_id: bookingId,
      provider,
    })).data,
};
