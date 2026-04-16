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
  externalSource: string;
  externalId: string;
  seriesId: string;
  detachedFromImport: boolean;
  status: "draft" | "published" | "cancelled" | "archived";
  detachedAt: string | null;
  organizerRoles: Array<{
    organizerId: string;
    roleId: string;
    displayOrder: number;
    organizerName?: string;
    organizerImageUrl?: string | null;
    organizerAvatarPath?: string | null;
    organizerStatus?: string;
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
  external_source: string | null;
  external_id: string | null;
  seriesId: string;
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
    organizer_name?: string;
    organizer_image_url?: string | null;
    organizer_avatar_path?: string | null;
    organizer_status?: string;
  }>;
  location_id: string | null;
  location: {
    id: string;
    label: string | null;
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
    rruleDtstartLocal: (data.rrule_dtstart_local ?? "").slice(0, 16),
    durationMinutes: data.duration_minutes?.toString() ?? "90",
    visibility: data.visibility ?? "public",
    coverImageUrl: data.cover_image_path ?? "",
    locationId: data.location_id,
    locationLabel: data.location?.label ?? "",
    locationCity: data.location?.city ?? "",
    locationCountry: (data.location?.country_code ?? "").toUpperCase(),
    locationLat: data.location?.lat ?? null,
    locationLng: data.location?.lng ?? null,
    locationAddress: data.location?.formatted_address ?? "",
    isImported: data.is_imported ?? false,
    importSource: data.import_source ?? null,
    externalSource: data.external_source ?? "",
    externalId: data.external_id ?? "",
    seriesId: data.seriesId ?? "",
    status: data.status ?? "draft",
    detachedFromImport: data.detached_from_import ?? false,
    detachedAt: data.detached_at ?? null,
    organizerRoles: (data.organizer_roles ?? []).map((r) => ({
      organizerId: r.organizer_id,
      roleId: r.role_id,
      displayOrder: r.display_order,
      organizerName: r.organizer_name,
      organizerImageUrl: r.organizer_image_url ?? null,
      organizerAvatarPath: r.organizer_avatar_path ?? null,
      organizerStatus: r.organizer_status ?? "published",
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
    languages: "",
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
    status: "draft",
    importSource: null,
    externalSource: "",
    externalId: "",
    seriesId: "",
    detachedFromImport: false,
    detachedAt: null,
    organizerRoles: [],
  };
}
