import { api } from "@/lib/api";
import type {
  BookingCreatePayload,
  BookingDetail,
  BookingListItem,
  Paginated,
  Quote,
} from "@/types/api";

export interface BookingQuery {
  /** Comma separated statuses, e.g. `"PENDING,APPROVED"`. */
  status?: string;
  scope?: "upcoming" | "past";
  stadium?: string;
  date?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  page?: number;
}

export const bookingsApi = {
  list: async (query: BookingQuery = {}) =>
    (await api.get<Paginated<BookingListItem>>("/bookings/", { params: query })).data,

  detail: async (id: string) => (await api.get<BookingDetail>(`/bookings/${id}/`)).data,

  /**
   * Price preview. The server recomputes the real total on create — this is a
   * display convenience only, never an input to the booking itself.
   */
  quote: async (stadiumId: string, durationHours: number) =>
    (
      await api.post<Quote>("/bookings/quote/", {
        stadium_id: stadiumId,
        duration_hours: durationHours,
      })
    ).data,

  create: async (payload: BookingCreatePayload) =>
    (await api.post<BookingDetail>("/bookings/create_booking/", payload)).data,

  approve: async (id: string) =>
    (await api.post<BookingDetail>(`/bookings/${id}/approve/`, {})).data,

  reject: async (id: string, reason: string) =>
    (await api.post<BookingDetail>(`/bookings/${id}/reject/`, { reason })).data,

  cancel: async (id: string, reason: string) =>
    (await api.post<BookingDetail>(`/bookings/${id}/cancel/`, { reason })).data,
};
