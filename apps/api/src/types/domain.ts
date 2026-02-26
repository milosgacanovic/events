export type EventSeriesRow = {
  id: string;
  slug: string;
  title: string;
  description_json: Record<string, unknown>;
  external_source: string | null;
  external_id: string | null;
  cover_image_path: string | null;
  external_url: string | null;
  attendance_mode: "in_person" | "online" | "hybrid";
  online_url: string | null;
  practice_category_id: string;
  practice_subcategory_id: string | null;
  tags: string[];
  languages: string[];
  schedule_kind: "single" | "recurring";
  event_timezone: string;
  single_start_at: string | null;
  single_end_at: string | null;
  rrule: string | null;
  rrule_dtstart_local: string | null;
  duration_minutes: number | null;
  status: "draft" | "published" | "cancelled" | "archived";
  visibility: "public" | "unlisted";
  published_at: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type LocationRow = {
  id: string;
  label: string | null;
  formatted_address: string;
  country_code: string | null;
  city: string | null;
  lat: number;
  lng: number;
};

export type EventOccurrenceRow = {
  id?: string;
  eventId: string;
  startsAtUtc: string;
  endsAtUtc: string;
  status: "published" | "cancelled";
  locationId: string | null;
  countryCode: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
};
