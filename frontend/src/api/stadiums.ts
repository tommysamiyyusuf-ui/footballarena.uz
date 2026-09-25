import { api } from "@/lib/api";
import type {
  Amenity,
  Availability,
  Blackout,
  CityGroup,
  Paginated,
  StadiumDetail,
  StadiumImage,
  StadiumListItem,
  StadiumWritePayload,
} from "@/types/api";

export interface StadiumQuery {
  search?: string;
  city?: string;
  district?: string;
  field_type?: string;
  amenities?: string;
  min_price?: string;
  max_price?: string;
  min_rating?: string;
  lat?: number;
  lng?: number;
  radius?: string;
  ordering?: string;
  mine?: boolean;
  status?: string;
  page?: number;
  page_size?: number;
}

/** Drops empty values so the URL stays clean and the cache key stays stable. */
export function stadiumParams(query: StadiumQuery): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    params[key] = String(value);
  }
  return params;
}

export const stadiumsApi = {
  list: async (query: StadiumQuery) =>
    (
      await api.get<Paginated<StadiumListItem>>("/stadiums/", {
        params: stadiumParams(query),
      })
    ).data,

  detail: async (id: string) => (await api.get<StadiumDetail>(`/stadiums/${id}/`)).data,

  availability: async (id: string, date: string) =>
    (await api.get<Availability>(`/stadiums/${id}/availability/`, { params: { date } })).data,

  amenities: async () => (await api.get<Amenity[]>("/stadiums/amenities/")).data,

  cities: async () => (await api.get<CityGroup[]>("/stadiums/cities/")).data,

  create: async (payload: StadiumWritePayload) =>
    (await api.post<StadiumDetail>("/stadiums/", payload)).data,

  update: async (id: string, payload: Partial<StadiumWritePayload>) =>
    (await api.patch<StadiumDetail>(`/stadiums/${id}/`, payload)).data,

  remove: async (id: string) => {
    await api.delete(`/stadiums/${id}/`);
  },

  uploadImages: async (id: string, files: File[]) => {
    const form = new FormData();
    for (const file of files) form.append("images", file);
    return (
      await api.post<StadiumImage[]>(`/stadiums/${id}/images/`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
    ).data;
  },

  deleteImage: async (id: string, imageId: string) => {
    await api.delete(`/stadiums/${id}/images/${imageId}/`);
  },

  setCover: async (id: string, imageId: string) =>
    (await api.post<StadiumImage>(`/stadiums/${id}/images/${imageId}/cover/`)).data,

  blackouts: async (id: string) =>
    (await api.get<Blackout[]>(`/stadiums/${id}/blackouts/`)).data,

  createBlackout: async (
    id: string,
    payload: { date: string; start_time?: string; end_time?: string; reason?: string },
  ) => (await api.post<Blackout>(`/stadiums/${id}/blackouts/`, payload)).data,

  deleteBlackout: async (id: string, blackoutId: string) => {
    await api.delete(`/stadiums/${id}/blackouts/${blackoutId}/`);
  },
};
