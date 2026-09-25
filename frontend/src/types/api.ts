/**
 * Mirrors the DRF serializers exactly. Regenerate expectations from
 * `python manage.py spectacular` whenever the backend contract changes.
 *
 * Money always arrives as a decimal *string* — never parse it into a float for
 * display, only for arithmetic, and always re-format through `formatMoney`.
 */

export type Role = "ADMIN" | "OWNER" | "USER";
export type FieldType = "MINI" | "F5" | "F7" | "F11";
export type StadiumStatus = "PENDING" | "APPROVED" | "REJECTED" | "BLOCKED";
export type BookingStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "COMPLETED"
  | "EXPIRED";
export type PaymentProvider = "CASH" | "CLICK" | "PAYME" | "UZUM";
export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "CANCELLED";
export type ModerationAction = "APPROVE" | "REJECT" | "REQUEST_CHANGES" | "BLOCK";

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** Every non-2xx response from the API uses this envelope. */
export interface ApiError {
  success: false;
  code: string;
  message: string;
  errors: Record<string, string[] | string>;
  /** Only present on 409 responses from the booking endpoint. */
  alternatives?: SlotSuggestion[];
}

/** A free window long enough for the requested duration. */
export interface SlotSuggestion {
  start_time: string;
  end_time: string;
  total_price: string;
}

// --- Users -------------------------------------------------------------------

export interface UserProfile {
  birth_date: string | null;
  city: string;
  district: string;
  default_latitude: number | null;
  default_longitude: number | null;
  notify_web: boolean;
  notify_email: boolean;
  notify_telegram: boolean;
}

export interface OwnerProfile {
  company_name: string;
  contact_phone: string;
  contact_email: string;
  telegram_contact: string;
  tax_id: string;
  payout_details: string;
  commission_percent: string;
}

export interface Me {
  id: string;
  phone: string;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  full_name: string;
  avatar: string | null;
  role: Role;
  language: string;
  telegram_username: string;
  is_verified: boolean;
  is_blocked: boolean;
  created_at: string;
  profile: UserProfile | null;
  owner_profile: OwnerProfile | null;
}

export interface Tokens {
  access: string;
  refresh: string;
}

export interface AuthResponse {
  success: true;
  is_new_user: boolean;
  registration_required: false;
  tokens: Tokens;
  user: Me;
}

export interface RegistrationRequiredResponse {
  success: true;
  registration_required: true;
  verification_token: string;
  phone: string;
}

export type VerifyOtpResponse = AuthResponse | RegistrationRequiredResponse;

export interface RequestOtpResponse {
  success: true;
  phone: string;
  expires_in: number;
  resend_after: number;
  /** False when this phone has no account yet — verification will ask for a name. */
  is_registered: boolean;
  /** Dev-only convenience. Production never returns this. */
  debug_code?: string;
}

// --- Platform config ---------------------------------------------------------

export interface PublicConfig {
  platform_name: string;
  currency: string;
  maintenance_mode: boolean;
  booking: {
    min_duration_hours: number;
    max_duration_hours: number;
    max_advance_days: number;
    cancel_window_hours: number;
  };
  auth: {
    google_enabled: boolean;
    google_client_id: string;
    yandex_enabled: boolean;
    yandex_client_id: string;
    telegram_enabled: boolean;
    telegram_bot_username: string;
  };
  maps: { yandex_api_key: string };
  otp: { length: number; ttl_seconds: number; resend_cooldown_seconds: number };
  support: { phone: string; email: string; telegram: string };
}

// --- Stadiums ----------------------------------------------------------------

export interface Amenity {
  id: number;
  code: string;
  name: string;
  name_uz: string;
  icon: string;
}

export interface StadiumImage {
  id: string;
  image: string;
  caption: string;
  is_cover: boolean;
  sort_order: number;
}

export interface WorkingHour {
  weekday: number;
  weekday_name: string;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
}

export interface StadiumListItem {
  id: string;
  name: string;
  slug: string;
  city: string;
  district: string;
  address: string;
  latitude: number;
  longitude: number;
  field_type: FieldType;
  field_type_display: string;
  price_per_hour: string;
  rating: string;
  review_count: number;
  cover_image: string | null;
  distance_km: number | null;
  is_favorite: boolean;
  amenity_codes: string[];
  is_active: boolean;
  status: StadiumStatus;
}

export interface StadiumDetail extends StadiumListItem {
  description: string;
  capacity: number | null;
  country: string;
  phone: string;
  images: StadiumImage[];
  amenities: Amenity[];
  working_hours: WorkingHour[];
  owner: {
    id: string;
    name: string;
    company_name?: string;
    phone?: string;
    telegram_username?: string;
  } | null;
  booking_count: number;
  moderation_note: string;
  created_at: string;
}

export interface StadiumWritePayload {
  name: string;
  description?: string;
  field_type?: FieldType;
  capacity?: number | null;
  price_per_hour: string;
  country?: string;
  city: string;
  district?: string;
  address: string;
  latitude: number;
  longitude: number;
  phone?: string;
  is_active?: boolean;
  amenity_ids?: number[];
  working_hours?: Array<{
    weekday: number;
    open_time?: string | null;
    close_time?: string | null;
    is_closed?: boolean;
  }>;
}

export interface TimeSlot {
  start_time: string;
  end_time: string;
  is_available: boolean;
  reason: string;
  price: string;
}

export interface Availability {
  date: string;
  is_open: boolean;
  open_time: string | null;
  close_time: string | null;
  price_per_hour: string;
  slots: TimeSlot[];
}

export interface CityGroup {
  city: string;
  districts: string[];
}

export interface Blackout {
  id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  reason: string;
}

export interface Favorite {
  id: number;
  stadium: StadiumListItem;
  created_at: string;
}

// --- Bookings ----------------------------------------------------------------

export interface BookingStadium {
  id: string;
  name: string;
  address: string;
  city: string;
  district: string;
  latitude: number;
  longitude: number;
  cover_image: string | null;
  phone: string;
}

export interface BookingListItem {
  id: string;
  reference: string;
  stadium: BookingStadium;
  date: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  starts_at: string;
  ends_at: string;
  hourly_price: string;
  total_price: string;
  currency: string;
  status: BookingStatus;
  status_display: string;
  rejection_reason: string;
  cancellation_reason: string;
  can_cancel: boolean;
  can_review: boolean;
  created_at: string;
}

export interface BookingStatusHistory {
  id: number;
  from_status: string;
  to_status: string;
  note: string;
  changed_by_name: string;
  created_at: string;
}

export interface BookingDetail extends BookingListItem {
  customer: { id: string; name: string; phone: string; avatar: string | null } | null;
  owner_contact: { id: string; name: string; phone: string } | null;
  customer_note: string;
  contact_phone: string;
  players_count: number | null;
  commission_percent: string;
  commission_amount: string;
  owner_earning: string;
  approved_at: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  status_history: BookingStatusHistory[];
  conversation_id: string | null;
}

export interface BookingCreatePayload {
  stadium_id: string;
  date: string;
  start_time: string;
  duration_hours: number;
  customer_note?: string;
  contact_phone?: string;
  players_count?: number;
}

export interface Quote {
  stadium_id: string;
  duration_hours: number;
  hourly_price: string;
  total_price: string;
  commission_percent: string;
  commission_amount: string;
  owner_earning: string;
  currency: string;
}

// --- Reviews -----------------------------------------------------------------

export interface Review {
  id: string;
  booking: string;
  booking_reference: string;
  stadium: string;
  stadium_name: string;
  user_name: string;
  user_avatar: string | null;
  rating: number;
  comment: string;
  owner_reply: string;
  owner_replied_at: string | null;
  is_visible: boolean;
  created_at: string;
}

// --- Chat --------------------------------------------------------------------

export interface Conversation {
  id: string;
  stadium: string;
  stadium_name: string;
  booking: string | null;
  booking_reference: string;
  participant: { id: string; name: string; avatar: string | null; role: Role } | null;
  last_message_at: string | null;
  last_message_preview: string;
  unread_count: number;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  conversation: string;
  sender: string;
  sender_name: string;
  text: string;
  attachment?: string | null;
  is_read: boolean;
  created_at: string;
}

// --- Notifications -----------------------------------------------------------

export type NotificationType =
  | "BOOKING_CREATED"
  | "BOOKING_APPROVED"
  | "BOOKING_REJECTED"
  | "BOOKING_CANCELLED"
  | "BOOKING_COMPLETED"
  | "BOOKING_REMINDER"
  | "STADIUM_SUBMITTED"
  | "STADIUM_APPROVED"
  | "STADIUM_REJECTED"
  | "STADIUM_CHANGES_REQUESTED"
  | "NEW_MESSAGE"
  | "NEW_REVIEW"
  | "PAYMENT_SUCCESS"
  | "PAYMENT_FAILED"
  | "ACCOUNT_BLOCKED"
  | "SYSTEM";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  payload: Record<string, unknown> & { route?: string };
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

// --- Payments ----------------------------------------------------------------

export interface Payment {
  id: string;
  booking: string;
  booking_reference: string;
  stadium_name: string;
  amount: string;
  currency: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  transaction_id: string;
  paid_at: string | null;
  failure_reason: string;
  created_at: string;
}

// --- Analytics ---------------------------------------------------------------

export interface RevenueWindow {
  gross: string;
  commission: string;
  net: string;
  bookings: number;
}

export interface RevenueSummary {
  today: RevenueWindow;
  week: RevenueWindow;
  month: RevenueWindow;
  year: RevenueWindow;
  total: RevenueWindow;
}

export interface BookingCounters {
  total: number;
  pending: number;
  approved: number;
  completed: number;
  cancelled: number;
  rejected: number;
  expired: number;
  today: number;
  upcoming: number;
}

export interface DailyPoint {
  date: string;
  revenue: string;
  bookings: number;
}

export interface MonthlyPoint {
  month: string;
  revenue: string;
  bookings: number;
}

export interface HourPoint {
  hour: string;
  bookings: number;
}

export interface WeekdayPoint {
  weekday: string;
  bookings: number;
}

export interface StadiumPerformance {
  stadium_id: string;
  name: string;
  revenue: string;
  bookings: number;
  rating: number;
}

export interface GrowthPoint {
  date: string;
  count: number;
}

export interface OwnerDashboard {
  stadiums: {
    total: number;
    approved: number;
    pending: number;
    rejected: number;
    inactive: number;
  };
  bookings: BookingCounters;
  today_bookings: number;
  revenue: RevenueSummary;
  rating: { average: number; reviews: number };
  occupancy_rate: number;
  pending_requests: BookingListItem[];
  upcoming_bookings: BookingListItem[];
}

export interface OwnerStatistics {
  revenue: RevenueSummary;
  counters: BookingCounters;
  daily: DailyPoint[];
  monthly: MonthlyPoint[];
  popular_hours: HourPoint[];
  weekdays: WeekdayPoint[];
  stadium_performance: StadiumPerformance[];
}

export interface CalendarBooking {
  id: string;
  reference: string;
  stadium: string;
  stadium_id: string;
  customer: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  total_price: string;
  status: BookingStatus;
}

export interface OwnerCalendar {
  year: number;
  month: number;
  days: Record<string, CalendarBooking[]>;
}

export interface AdminDashboard {
  users: { total: number; blocked: number; new_today: number };
  owners: { total: number; blocked: number };
  stadiums: {
    total: number;
    approved: number;
    pending: number;
    rejected: number;
    blocked: number;
  };
  bookings: BookingCounters;
  revenue: {
    gross: string;
    platform_commission: string;
    owner_net: string;
    today: string;
  };
  reviews: { total: number; hidden: number };
  pending_stadiums: StadiumDetail[];
}

export interface AdminStatistics {
  revenue: RevenueSummary;
  daily: DailyPoint[];
  monthly: MonthlyPoint[];
  popular_hours: HourPoint[];
  stadium_performance: StadiumPerformance[];
  user_growth: GrowthPoint[];
  stadium_growth: GrowthPoint[];
  booking_growth: GrowthPoint[];
}

export interface AdminFinance {
  totals: { gross: string; commission: string; owner_net: string; bookings: number };
  revenue: RevenueSummary;
  daily: DailyPoint[];
  monthly: MonthlyPoint[];
  by_owner: Array<{
    owner_id: string;
    owner_name: string;
    gross: string;
    commission: string;
    net: string;
    bookings: number;
  }>;
}

// --- Admin resources ---------------------------------------------------------

export interface AdminUser {
  id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  username: string;
  telegram_username: string;
  avatar: string | null;
  role: Role;
  is_active: boolean;
  is_verified: boolean;
  is_blocked: boolean;
  blocked_reason: string;
  last_seen_at: string | null;
  created_at: string;
  booking_count: number;
  completed_bookings: number;
  total_spent: string;
}

export interface AdminOwner extends AdminUser {
  company_name: string;
  contact_phone: string;
  commission_percent: string;
  stadium_count: number;
  total_revenue: string;
}

export interface AdminBooking {
  id: string;
  reference: string;
  status: BookingStatus;
  date: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  total_price: string;
  commission_amount: string;
  owner_earning: string;
  currency: string;
  created_at: string;
  stadium_name: string;
  stadium_id: string;
  customer_name: string;
  customer_phone: string;
  owner_name: string;
}

export interface PlatformSettings {
  platform_name: string;
  commission_percent: string;
  booking_cancel_window_hours: number;
  booking_max_advance_days: number;
  booking_min_duration_hours: number;
  booking_max_duration_hours: number;
  auto_approve_stadiums: boolean;
  notifications_email_enabled: boolean;
  notifications_telegram_enabled: boolean;
  support_phone: string;
  support_email: string;
  support_telegram: string;
  maintenance_mode: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuditLogEntry {
  id: string;
  actor: string | null;
  actor_name: string;
  action: string;
  target_type: string;
  target_id: string;
  description: string;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}
