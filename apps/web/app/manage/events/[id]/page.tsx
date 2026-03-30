"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ROLE_ADMIN } from "@dr-events/shared";

import { useKeycloakAuth } from "../../../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../../../components/i18n/I18nProvider";
import { AssignToUserModal } from "../../../../components/manage/AssignToUserModal";
import { EventForm } from "../../../../components/manage/EventForm";
import { eventFormStateFromApi, type AdminEventDetailResponse, type EventFormState } from "../../../../components/manage/EventFormTypes";
import { authorizedDelete, authorizedGet } from "../../../../lib/manageApi";

export default function EditEventPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getToken, roles } = useKeycloakAuth();
  const { t } = useI18n();
  const [state, setState] = useState<EventFormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAssign, setShowAssign] = useState(false);
  const [initialStatus, setInitialStatus] = useState("");
  const isAdmin = roles.includes(ROLE_ADMIN);

  // Show save banner when redirected from create page
  useEffect(() => {
    const saved = searchParams.get("saved");
    if (saved) {
      if (saved === "draft") setInitialStatus(t("manage.form.savedAsDraft"));
      else if (saved === "published") setInitialStatus(t("manage.form.savedAndPublished"));
      router.replace(`/manage/events/${id}`, { scroll: false });
    }
  }, []);

  async function handleDelete() {
    try {
      await authorizedDelete(getToken, `/events/${id}`);
      router.push("/manage/events");
    } catch (err) {
      alert(err instanceof Error ? err.message : t("manage.form.unknownError"));
    }
  }

  const load = useCallback(async () => {
    try {
      const data = await authorizedGet<AdminEventDetailResponse>(getToken, `/admin/events/${id}`);
      setState(eventFormStateFromApi(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("manage.eventForm.failedToLoad"));
    } finally {
      setLoading(false);
    }
  }, [getToken, id]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="manage-loading">{t("manage.eventForm.loadingEvent")}</div>;
  if (error) return <div className="manage-empty"><h3>Error</h3><p>{error}</p></div>;
  if (!state) return <div className="manage-empty"><h3>{t("manage.eventForm.eventNotFound")}</h3></div>;

  return (
    <div className="manage-form-page">
      <Link href="/manage/events" className="manage-back-link">{t("manage.eventForm.backToEvents")}</Link>
      <h1 className="manage-page-title">{t("manage.eventForm.editEvent")}</h1>
      <EventForm
        mode="edit"
        initialState={state}
        initialStatusMessage={initialStatus || undefined}
        onDelete={state.status === "archived" ? () => void handleDelete() : undefined}
        extraActions={isAdmin ? (
          <button type="button" className="secondary-btn" onClick={() => setShowAssign(true)}>
            {t("manage.common.assignToUser")}
          </button>
        ) : undefined}
      />
      {showAssign && (
        <AssignToUserModal
          getToken={getToken}
          entityType="events"
          entityId={id}
          onAssigned={() => { setShowAssign(false); void load(); }}
          onClose={() => setShowAssign(false)}
        />
      )}
    </div>
  );
}
