"use client";

import { useEffect, useState } from "react";

import { useKeycloakAuth } from "../../components/auth/KeycloakAuthProvider";
import { LocaleSwitcher } from "../../components/i18n/LocaleSwitcher";
import { useI18n } from "../../components/i18n/I18nProvider";
import { apiBase } from "../../lib/api";
import { getUserTimeZone, readTimeDisplayMode, writeTimeDisplayMode } from "../../lib/timeDisplay";

type ProfilePayload = {
  id: string;
  keycloakSub: string;
  displayName: string | null;
  email: string | null;
  createdAt: string;
};

export default function ProfilePage() {
  const { t } = useI18n();
  const auth = useKeycloakAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [timeDisplayMode, setTimeDisplayMode] = useState<"event" | "user">("user");
  const [userTimeZone, setUserTimeZone] = useState("UTC");

  useEffect(() => {
    setTimeDisplayMode(readTimeDisplayMode());
    setUserTimeZone(getUserTimeZone());
  }, []);

  useEffect(() => {
    if (!auth.ready) {
      return;
    }

    if (!auth.authenticated) {
      setLoading(false);
      setProfile(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    auth
      .getToken()
      .then(async (token) => {
        if (!token || !active) {
          return;
        }

        const response = await fetch(`${apiBase}/profile`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`profile_load_failed_${response.status}`);
        }

        const payload = (await response.json()) as ProfilePayload;
        if (!active) {
          return;
        }

        setProfile(payload);
        setDisplayName(payload.displayName ?? "");
      })
      .catch((nextError) => {
        if (!active) {
          return;
        }
        const message = nextError instanceof Error ? nextError.message : t("profile.error.loadFailed");
        setError(message);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [auth, t]);

  async function saveProfile() {
    if (!auth.authenticated) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const token = await auth.getToken();
      if (!token) {
        throw new Error("missing_token");
      }

      const response = await fetch(`${apiBase}/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ displayName: displayName.trim() || undefined }),
      });

      if (!response.ok) {
        throw new Error(`profile_save_failed_${response.status}`);
      }

      const payload = (await response.json()) as ProfilePayload;
      setProfile(payload);
      setDisplayName(payload.displayName ?? "");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t("profile.error.saveFailed"));
    } finally {
      setSaving(false);
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
      <label className="meta">
        <input
          type="checkbox"
          checked={timeDisplayMode === "event"}
          onChange={(event) => {
            const nextMode = event.target.checked ? "event" : "user";
            setTimeDisplayMode(nextMode);
            writeTimeDisplayMode(nextMode);
          }}
        />{" "}
        {timeDisplayMode === "event"
          ? t("profile.timeMode.eventWithZone", { zone: t("common.eventTimezone") })
          : t("profile.timeMode.userWithZone", { zone: userTimeZone })}
      </label>
      <button className="secondary-btn" type="button" onClick={() => void saveProfile()} disabled={saving}>
        {saving ? t("profile.saving") : t("profile.save")}
      </button>
    </section>
  );
}
