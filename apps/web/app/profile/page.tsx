"use client";

import { useEffect, useState } from "react";

import { useKeycloakAuth } from "../../components/auth/KeycloakAuthProvider";
import { LocaleSwitcher } from "../../components/i18n/LocaleSwitcher";
import { useI18n } from "../../components/i18n/I18nProvider";
import { CityAutocomplete, type CitySelection } from "../../components/CityAutocomplete";
import {
  FollowHostModal,
  type ExistingAlert,
  type ProfileDefaults,
} from "../../components/FollowHostModal";
import { apiBase } from "../../lib/api";
import { getUserTimeZone, readTimeDisplayMode, writeTimeDisplayMode } from "../../lib/timeDisplay";

const RADIUS_OPTIONS = [50, 100, 300, 500, 1000];

type SavedEventItem = {
  id: string;
  eventId: string;
  occurrenceId: string | null;
  scope: string;
  createdAt: string;
  eventTitle: string;
  eventSlug: string;
  eventStatus: string;
  singleStartAt: string | null;
  nextOccurrenceStart: string | null;
  coverImagePath: string | null;
};

type ProfilePayload = {
  id: string;
  keycloakSub: string;
  displayName: string | null;
  email: string | null;
  homeCountryCode: string | null;
  homeCity: string | null;
  homeLat: number | null;
  homeLng: number | null;
  homeLocationLabel: string | null;
  defaultRadiusKm: number | null;
  createdAt: string;
};

type RsvpItem = {
  id: string;
  eventId: string;
  occurrenceId: string | null;
  createdAt: string;
  eventTitle: string;
  eventSlug: string;
  singleStartAt: string | null;
  nextOccurrenceStart: string | null;
  coverImagePath: string | null;
};

type SavedSearchItem = {
  id: string;
  label: string | null;
  filterSnapshot: Record<string, unknown>;
  frequency: string;
  notifyNew: boolean;
  notifyReminders: boolean;
  notifyUpdates: boolean;
  unsubscribedAt: string | null;
  createdAt: string;
};

type UserCommentItem = {
  id: string;
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  body: string;
  status: string;
  createdAt: string;
};

type AlertListItem = {
  id: string;
  organizerId: string;
  organizerName: string;
  organizerSlug: string;
  organizerImageUrl: string | null;
  radiusKm: number;
  lat: number | null;
  lng: number | null;
  locationLabel: string | null;
  city: string | null;
  countryCode: string | null;
  unsubscribedAt: string | null;
  createdAt: string;
};

export default function ProfilePage() {
  const { t } = useI18n();
  const auth = useKeycloakAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingHome, setSavingHome] = useState(false);
  const [homeStatus, setHomeStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [homeCity, setHomeCity] = useState<CitySelection | null>(null);
  const [defaultRadiusKm, setDefaultRadiusKm] = useState<number>(100);
  const [savedEvents, setSavedEvents] = useState<SavedEventItem[]>([]);
  const [rsvps, setRsvps] = useState<RsvpItem[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearchItem[]>([]);
  const [userComments, setUserComments] = useState<UserCommentItem[]>([]);
  const [alerts, setAlerts] = useState<AlertListItem[]>([]);
  const [editingAlert, setEditingAlert] = useState<AlertListItem | null>(null);
  const [timeDisplayMode, setTimeDisplayMode] = useState<"event" | "user">(() => readTimeDisplayMode());
  const [userTimeZone] = useState(() => (typeof window !== "undefined" ? getUserTimeZone() : "UTC"));

  useEffect(() => {
    if (!auth.ready) return;
    if (!auth.authenticated) {
      setLoading(false);
      setProfile(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const token = await auth.getToken();
        if (!token || !active) return;

        const headers = { Authorization: `Bearer ${token}` };
        const [profileResponse, alertsResponse, savedResponse, rsvpResponse, searchesResponse, commentsResponse] = await Promise.all([
          fetch(`${apiBase}/profile`, { headers, cache: "no-store" }),
          fetch(`${apiBase}/profile/alerts`, { headers, cache: "no-store" }),
          fetch(`${apiBase}/profile/saved-events`, { headers, cache: "no-store" }),
          fetch(`${apiBase}/profile/rsvps`, { headers, cache: "no-store" }),
          fetch(`${apiBase}/profile/saved-searches`, { headers, cache: "no-store" }),
          fetch(`${apiBase}/profile/comments`, { headers, cache: "no-store" }),
        ]);

        if (!profileResponse.ok) throw new Error(`profile_load_failed_${profileResponse.status}`);
        const profilePayload = (await profileResponse.json()) as ProfilePayload;
        if (!active) return;
        setProfile(profilePayload);
        setDisplayName(profilePayload.displayName ?? "");
        setDefaultRadiusKm(profilePayload.defaultRadiusKm ?? 100);
        if (profilePayload.homeLat != null && profilePayload.homeLng != null) {
          setHomeCity({
            label: profilePayload.homeLocationLabel ?? "",
            city: profilePayload.homeCity ?? "",
            countryCode: profilePayload.homeCountryCode,
            lat: profilePayload.homeLat,
            lng: profilePayload.homeLng,
          });
        }

        if (alertsResponse.ok) {
          const alertsPayload = (await alertsResponse.json()) as { items: AlertListItem[] };
          if (active) setAlerts(alertsPayload.items);
        }
        if (savedResponse.ok) {
          const savedPayload = (await savedResponse.json()) as { items: SavedEventItem[] };
          if (active) setSavedEvents(savedPayload.items);
        }
        if (rsvpResponse.ok) {
          const rsvpPayload = (await rsvpResponse.json()) as { items: RsvpItem[] };
          if (active) setRsvps(rsvpPayload.items);
        }
        if (searchesResponse.ok) {
          const searchesPayload = (await searchesResponse.json()) as { items: SavedSearchItem[] };
          if (active) setSavedSearches(searchesPayload.items);
        }
        if (commentsResponse.ok) {
          const commentsPayload = (await commentsResponse.json()) as { items: UserCommentItem[] };
          if (active) setUserComments(commentsPayload.items);
        }
      } catch (nextError) {
        if (!active) return;
        setError(nextError instanceof Error ? nextError.message : t("profile.error.loadFailed"));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [auth.ready, auth.authenticated, auth.getToken, t]);

  async function saveProfile() {
    if (!auth.authenticated) return;
    setSaving(true);
    setError(null);
    try {
      const token = await auth.getToken();
      if (!token) throw new Error("missing_token");
      const response = await fetch(`${apiBase}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ displayName: displayName.trim() || undefined }),
      });
      if (!response.ok) throw new Error(`profile_save_failed_${response.status}`);
      const payload = (await response.json()) as ProfilePayload;
      setProfile(payload);
      setDisplayName(payload.displayName ?? "");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t("profile.error.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function saveHomeLocation() {
    if (!auth.authenticated) return;
    setSavingHome(true);
    setHomeStatus(null);
    try {
      const token = await auth.getToken();
      if (!token) throw new Error("missing_token");
      // Send `null` for fields the user has cleared so the API knows to wipe them —
      // `undefined` would mean "leave unchanged". `homeCity` null clears the saved
      // home location entirely.
      const body = {
        homeCity: homeCity?.city ?? null,
        homeCountryCode: homeCity?.countryCode ?? null,
        homeLat: homeCity?.lat ?? null,
        homeLng: homeCity?.lng ?? null,
        homeLocationLabel: homeCity?.label ?? null,
        defaultRadiusKm,
      };
      const response = await fetch(`${apiBase}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`profile_save_failed_${response.status}`);
      const payload = (await response.json()) as ProfilePayload;
      setProfile(payload);
      setHomeStatus(t("profile.homeLocation.saved"));
    } catch (nextError) {
      setHomeStatus(nextError instanceof Error ? nextError.message : t("profile.error.saveFailed"));
    } finally {
      setSavingHome(false);
    }
  }

  async function unfollowAlert(id: string) {
    const token = await auth.getToken();
    if (!token) return;
    const response = await fetch(`${apiBase}/profile/alerts/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      setAlerts((current) => current.filter((alert) => alert.id !== id));
    }
  }

  async function cancelRsvp(eventId: string) {
    const token = await auth.getToken();
    if (!token) return;
    const response = await fetch(`${apiBase}/profile/rsvps/${eventId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      setRsvps((current) => current.filter((item) => item.eventId !== eventId));
    }
  }

  async function deleteComment(eventId: string, commentId: string) {
    const token = await auth.getToken();
    if (!token) return;
    const response = await fetch(`${apiBase}/events/${eventId}/comments/${commentId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      setUserComments((current) => current.filter((item) => item.id !== commentId));
    }
  }

  async function deleteSavedSearch(searchId: string) {
    const token = await auth.getToken();
    if (!token) return;
    const response = await fetch(`${apiBase}/profile/saved-searches/${searchId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      setSavedSearches((current) => current.filter((item) => item.id !== searchId));
    }
  }

  async function unsaveEvent(eventId: string) {
    const token = await auth.getToken();
    if (!token) return;
    const response = await fetch(`${apiBase}/profile/saved-events/${eventId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      setSavedEvents((current) => current.filter((item) => item.eventId !== eventId));
    }
  }

  if (loading) {
    return <section className="panel">{t("profile.loading")}</section>;
  }

  if (!auth.authenticated) {
    return (
      <section className="panel cards">
        <h1 className="title-xl">{t("profile.title")}</h1>
        <p className="muted">{t("profile.loginRequired")}</p>
        <button className="secondary-btn" type="button" onClick={() => void auth.login()}>
          {t("nav.login")}
        </button>
      </section>
    );
  }

  const profileDefaults: ProfileDefaults | null = profile
    ? {
        homeLat: profile.homeLat,
        homeLng: profile.homeLng,
        homeLocationLabel: profile.homeLocationLabel,
        homeCity: profile.homeCity,
        homeCountryCode: profile.homeCountryCode,
        defaultRadiusKm: profile.defaultRadiusKm,
      }
    : null;

  return (
    <section className="panel cards">
      <h1 className="title-xl">{t("profile.title")}</h1>
      <LocaleSwitcher />
      {error && <div className="muted">{error}</div>}

      <label>
        {t("profile.displayName")}
        <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
      </label>
      <div className="meta">
        {t("profile.username")} {profile?.email ?? auth.userName ?? t("common.none")}
      </div>
      <label className="toggle-control">
        <input
          className="toggle-control-input"
          type="checkbox"
          checked={timeDisplayMode === "event"}
          onChange={(event) => {
            const nextMode = event.target.checked ? "event" : "user";
            setTimeDisplayMode(nextMode);
            writeTimeDisplayMode(nextMode);
          }}
        />
        <span className="toggle-control-track" aria-hidden />
        <span className="meta">
          {timeDisplayMode === "event"
            ? t("profile.timeMode.eventWithZone", { zone: t("common.eventTimezone") })
            : t("profile.timeMode.userWithZone", { zone: userTimeZone })}
        </span>
      </label>
      <button className="secondary-btn" type="button" onClick={() => void saveProfile()} disabled={saving}>
        {saving ? t("profile.saving") : t("profile.save")}
      </button>

      <hr />

      <h2 className="title-l">{t("profile.homeLocation.title")}</h2>
      <p className="muted">{t("profile.homeLocation.description")}</p>
      <div className="modal-field">
        <label className="modal-label" htmlFor="profile-home-city">
          {t("profile.homeLocation.cityLabel")}
        </label>
        <CityAutocomplete
          inputId="profile-home-city"
          value={homeCity}
          onChange={setHomeCity}
          placeholder={t("profile.homeLocation.cityPlaceholder")}
        />
      </div>
      <div className="modal-field">
        <label className="modal-label" htmlFor="profile-default-radius">
          {t("profile.homeLocation.radiusLabel")}
        </label>
        <select
          id="profile-default-radius"
          className="modal-select"
          value={defaultRadiusKm}
          onChange={(event) => setDefaultRadiusKm(Number(event.target.value))}
        >
          {RADIUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t("profile.homeLocation.radiusOption", { km: option })}
            </option>
          ))}
        </select>
      </div>
      <button
        className="secondary-btn"
        type="button"
        onClick={() => void saveHomeLocation()}
        disabled={savingHome}
      >
        {savingHome ? t("profile.saving") : t("profile.homeLocation.save")}
      </button>
      {homeStatus && <div className="meta">{homeStatus}</div>}

      <hr />

      <h2 className="title-l">{t("profile.savedEvents.title")}</h2>
      {savedEvents.length === 0 ? (
        <p className="muted">{t("profile.savedEvents.empty")}</p>
      ) : (
        <ul className="saved-events-list">
          {savedEvents.map((item) => (
            <li key={item.id} className="saved-events-item">
              {item.coverImagePath && (
                <a href={`/events/${item.eventSlug}`} className="saved-events-thumb">
                  <img src={item.coverImagePath} alt="" loading="lazy" />
                </a>
              )}
              <div className="saved-events-info">
                <a href={`/events/${item.eventSlug}`} className="saved-events-title">
                  {item.eventTitle}
                </a>
                <div className="meta">
                  {item.nextOccurrenceStart
                    ? new Date(item.nextOccurrenceStart).toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })
                    : item.singleStartAt
                      ? new Date(item.singleStartAt).toLocaleDateString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })
                      : null}
                  {item.scope === "all" && item.occurrenceId == null && (
                    <> · {t("profile.savedEvents.allSessions")}</>
                  )}
                </div>
              </div>
              <button
                className="secondary-btn"
                type="button"
                onClick={() => void unsaveEvent(item.eventId)}
              >
                {t("profile.savedEvents.unsave")}
              </button>
            </li>
          ))}
        </ul>
      )}

      <hr />

      <h2 className="title-l">{t("profile.alerts.title")}</h2>
      {alerts.length === 0 ? (
        <p className="muted">{t("profile.alerts.empty")}</p>
      ) : (
        <ul className="alerts-list">
          {alerts.map((alert) => (
            <li key={alert.id} className="alerts-item">
              <div className="alerts-item-main">
                <a href={`/hosts/${alert.organizerSlug}`} className="alerts-item-host">
                  {alert.organizerName}
                </a>
                <div className="meta">
                  {alert.locationLabel ?? t("profile.alerts.locationAnywhere")}
                  {alert.lat != null && ` · ${t("profile.alerts.radius", { km: alert.radiusKm })}`}
                  {alert.unsubscribedAt && ` · ${t("profile.alerts.unsubscribed")}`}
                </div>
              </div>
              <div className="alerts-item-actions">
                <button
                  className="secondary-btn"
                  type="button"
                  onClick={() => setEditingAlert(alert)}
                >
                  {t("profile.alerts.edit")}
                </button>
                <button
                  className="secondary-btn"
                  type="button"
                  onClick={() => void unfollowAlert(alert.id)}
                >
                  {t("profile.alerts.unfollow")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <hr />

      <h2 className="title-l">{t("profile.rsvps.title")}</h2>
      {rsvps.length === 0 ? (
        <p className="muted">{t("profile.rsvps.empty")}</p>
      ) : (
        <ul className="saved-events-list">
          {rsvps.map((item) => (
            <li key={item.id} className="saved-events-item">
              {item.coverImagePath && (
                <a href={`/events/${item.eventSlug}`} className="saved-events-thumb">
                  <img src={item.coverImagePath} alt="" loading="lazy" />
                </a>
              )}
              <div className="saved-events-info">
                <a href={`/events/${item.eventSlug}`} className="saved-events-title">
                  {item.eventTitle}
                </a>
                <div className="meta">
                  {item.nextOccurrenceStart
                    ? new Date(item.nextOccurrenceStart).toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })
                    : item.singleStartAt
                      ? new Date(item.singleStartAt).toLocaleDateString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })
                      : null}
                </div>
              </div>
              <button
                className="secondary-btn"
                type="button"
                onClick={() => void cancelRsvp(item.eventId)}
              >
                {t("profile.rsvps.cancel")}
              </button>
            </li>
          ))}
        </ul>
      )}

      <hr />

      <h2 className="title-l">{t("profile.savedSearches.title")}</h2>
      {savedSearches.length === 0 ? (
        <p className="muted">{t("profile.savedSearches.empty")}</p>
      ) : (
        <ul className="alerts-list">
          {savedSearches.map((search) => (
            <li key={search.id} className="alerts-item">
              <div className="alerts-item-main">
                <div className="alerts-item-host">
                  {search.label || t("profile.savedSearches.untitled")}
                </div>
                <div className="meta">
                  {search.frequency === "daily" ? t("notifyMe.dialog.daily") : t("notifyMe.dialog.weekly")}
                  {search.unsubscribedAt && ` · ${t("profile.alerts.unsubscribed")}`}
                </div>
              </div>
              <div className="alerts-item-actions">
                <button
                  className="secondary-btn"
                  type="button"
                  onClick={() => void deleteSavedSearch(search.id)}
                >
                  {t("profile.savedSearches.delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <hr />

      <h2 className="title-l">{t("profile.comments.title")}</h2>
      {userComments.length === 0 ? (
        <p className="muted">{t("profile.comments.empty")}</p>
      ) : (
        <ul className="comments-list">
          {userComments.map((comment) => (
            <li key={comment.id} className="comments-item">
              <div className="comments-item-header">
                <a href={`/events/${comment.eventSlug}`}>{comment.eventTitle}</a>
                <span className={`profile-comment-status profile-comment-status--${comment.status}`}>
                  {comment.status}
                </span>
              </div>
              <p className="comments-item-body">{comment.body}</p>
              <button
                type="button"
                className="report-btn"
                onClick={() => void deleteComment(comment.eventId, comment.id)}
              >
                {t("profile.comments.delete")}
              </button>
            </li>
          ))}
        </ul>
      )}

      {editingAlert && (
        <FollowHostModal
          organizerId={editingAlert.organizerId}
          organizerName={editingAlert.organizerName}
          existing={{
            id: editingAlert.id,
            organizerId: editingAlert.organizerId,
            radiusKm: editingAlert.radiusKm,
            lat: editingAlert.lat,
            lng: editingAlert.lng,
            locationLabel: editingAlert.locationLabel,
            city: editingAlert.city,
            countryCode: editingAlert.countryCode,
          }}
          profileDefaults={profileDefaults}
          onClose={() => setEditingAlert(null)}
          onSaved={(saved: ExistingAlert) => {
            setAlerts((current) =>
              current.map((alert) =>
                alert.id === saved.id
                  ? {
                      ...alert,
                      radiusKm: saved.radiusKm,
                      lat: saved.lat,
                      lng: saved.lng,
                      locationLabel: saved.locationLabel,
                      city: saved.city,
                      countryCode: saved.countryCode,
                    }
                  : alert,
              ),
            );
          }}
          onDeleted={() => {
            setAlerts((current) => current.filter((alert) => alert.id !== editingAlert.id));
          }}
        />
      )}
    </section>
  );
}
