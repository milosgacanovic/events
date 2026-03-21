import { isoToDatetimeLocal, ensureHtml } from "../../lib/formUtils";

export type EventFormState = {
  id: string;
  slug: string;
  title: string;
  descriptionHtml: string;
  attendanceMode: "in_person" | "online" | "hybrid";
  onlineUrl: string;
  externalUrl: string;
  practiceCategoryId: string;
  practiceSubcategoryId: string;
  eventFormatId: string;
  tags: string;
  languages: string;
  scheduleKind: "single" | "recurring";
  eventTimezone: string;
  singleStartAt: string;
  singleEndAt: string;
  rrule: string;
  rruleDtstartLocal: string;
  durationMinutes: string;
  visibility: "public" | "unlisted";
  coverImageUrl: string;
  locationId: string | null;
  locationLabel: string;
  locationCity: string;
  locationCountry: string;
  locationLat: number | null;
  locationLng: number | null;
  locationAddress: string;
  isImported: boolean;
  importSource: string | null;
  externalId: string | null;
  detachedFromImport: boolean;
  detachedAt: string | null;
  organizerRoles: Array<{
    organizerId: string;
    roleId: string;
    displayOrder: number;
  }>;
};

export type AdminEventDetailResponse = {
  id: string;
  slug: string;
  title: string;
  description_json?: Record<string, unknown>;
  attendance_mode: "in_person" | "online" | "hybrid";
  online_url: string | null;
  external_url: string | null;
  external_id: string | null;
  practice_category_id: string;
  practice_subcategory_id: string | null;
  event_format_id: string | null;
  tags: string[];
  languages: string[];
  schedule_kind: "single" | "recurring";
  event_timezone: string;
  single_start_at: string | null;
  single_end_at: string | null;
  rrule: string | null;
  rrule_dtstart_local: string | null;
  duration_minutes: number | null;
  visibility: "public" | "unlisted";
  status: "draft" | "published" | "cancelled" | "archived";
  cover_image_path: string | null;
  is_imported: boolean;
  import_source: string | null;
  detached_from_import: boolean;
  detached_at: string | null;
  organizer_roles: Array<{
    organizer_id: string;
    role_id: string;
    display_order: number;
  }>;
  location_id: string | null;
  location: {
    id: string;
    formatted_address: string;
    city: string | null;
    country_code: string | null;
    lat: number;
    lng: number;
  } | null;
};

export function eventFormStateFromApi(data: AdminEventDetailResponse): EventFormState {
  const html = data.description_json?.html;
  return {
    id: data.id,
    slug: data.slug,
    title: data.title,
    descriptionHtml: typeof html === "string" ? ensureHtml(html) : "",
    attendanceMode: data.attendance_mode,
    onlineUrl: data.online_url ?? "",
    externalUrl: data.external_url ?? "",
    practiceCategoryId: data.practice_category_id ?? "",
    practiceSubcategoryId: data.practice_subcategory_id ?? "",
    eventFormatId: data.event_format_id ?? "",
    tags: (data.tags ?? []).join(", "),
    languages: (data.languages ?? []).join(", "),
    scheduleKind: data.schedule_kind,
    eventTimezone: data.event_timezone ?? "UTC",
    singleStartAt: isoToDatetimeLocal(data.single_start_at),
    singleEndAt: isoToDatetimeLocal(data.single_end_at),
    rrule: data.rrule ?? "FREQ=WEEKLY;INTERVAL=1",
    rruleDtstartLocal: data.rrule_dtstart_local ?? "",
    durationMinutes: data.duration_minutes?.toString() ?? "90",
    visibility: data.visibility ?? "public",
    coverImageUrl: data.cover_image_path ?? "",
    locationId: data.location_id,
    locationLabel: data.location?.formatted_address ?? "",
    locationCity: data.location?.city ?? "",
    locationCountry: data.location?.country_code ?? "",
    locationLat: data.location?.lat ?? null,
    locationLng: data.location?.lng ?? null,
    locationAddress: data.location?.formatted_address ?? "",
    isImported: data.is_imported ?? false,
    importSource: data.import_source ?? null,
    externalId: data.external_id ?? null,
    detachedFromImport: data.detached_from_import ?? false,
    detachedAt: data.detached_at ?? null,
    organizerRoles: (data.organizer_roles ?? []).map((r) => ({
      organizerId: r.organizer_id,
      roleId: r.role_id,
      displayOrder: r.display_order,
    })),
  };
}

export function newEventFormState(): EventFormState {
  return {
    id: "",
    slug: "",
    title: "",
    descriptionHtml: "",
    attendanceMode: "in_person",
    onlineUrl: "",
    externalUrl: "",
    practiceCategoryId: "",
    practiceSubcategoryId: "",
    eventFormatId: "",
    tags: "",
    languages: "en",
    scheduleKind: "single",
    eventTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    singleStartAt: "",
    singleEndAt: "",
    rrule: "FREQ=WEEKLY;INTERVAL=1",
    rruleDtstartLocal: "",
    durationMinutes: "90",
    visibility: "public",
    coverImageUrl: "",
    locationId: null,
    locationLabel: "",
    locationCity: "",
    locationCountry: "",
    locationLat: null,
    locationLng: null,
    locationAddress: "",
    isImported: false,
    importSource: null,
    externalId: null,
    detachedFromImport: false,
    detachedAt: null,
    organizerRoles: [],
  };
}
