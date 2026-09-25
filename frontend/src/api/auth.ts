import { api } from "@/lib/api";
import type {
  AuthResponse,
  Me,
  RequestOtpResponse,
  UserProfile,
  VerifyOtpResponse,
} from "@/types/api";

export const authApi = {
  requestOtp: async (phone: string) =>
    (await api.post<RequestOtpResponse>("/auth/phone/request-otp/", { phone })).data,

  verifyOtp: async (phone: string, code: string) =>
    (await api.post<VerifyOtpResponse>("/auth/phone/verify/", { phone, code })).data,

  completeRegistration: async (payload: {
    verification_token: string;
    first_name: string;
    last_name?: string;
  }) => (await api.post<AuthResponse>("/auth/phone/complete/", payload)).data,

  passwordLogin: async (username: string, password: string) =>
    (await api.post<AuthResponse>("/auth/login/", { username, password })).data,

  google: async (payload: { id_token?: string; code?: string; redirect_uri?: string }) =>
    (await api.post<AuthResponse>("/auth/google/", payload)).data,

  yandex: async (payload: { access_token?: string; code?: string; redirect_uri?: string }) =>
    (await api.post<AuthResponse>("/auth/yandex/", payload)).data,

  telegram: async (payload: Record<string, string | number>) =>
    (await api.post<AuthResponse>("/auth/telegram/", payload)).data,

  me: async () => (await api.get<Me>("/users/me/")).data,

  updateMe: async (payload: {
    first_name?: string;
    last_name?: string;
    email?: string;
    language?: string;
    profile?: Partial<UserProfile>;
  }) => (await api.patch<Me>("/users/me/", payload)).data,

  updateAvatar: async (file: File) => {
    const form = new FormData();
    form.append("avatar", file);
    return (
      await api.patch<Me>("/users/me/", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
    ).data;
  },

  changePassword: async (current_password: string, new_password: string) =>
    (await api.post("/users/me/password/", { current_password, new_password })).data,
};
