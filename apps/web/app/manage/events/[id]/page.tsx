"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useKeycloakAuth } from "../../../../components/auth/KeycloakAuthProvider";
import { EventForm } from "../../../../components/manage/EventForm";
import { eventFormStateFromApi, type AdminEventDetailResponse, type EventFormState } from "../../../../components/manage/EventFormTypes";
import { authorizedGet } from "../../../../lib/manageApi";

export default function EditEventPage() {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useKeycloakAuth();
  const [state, setState] = useState<EventFormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await authorizedGet<AdminEventDetailResponse>(getToken, `/admin/events/${id}`);
      setState(eventFormStateFromApi(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load event");
    } finally {
      setLoading(false);
    }
  }, [getToken, id]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="manage-loading">Loading event...</div>;
  if (error) return <div className="manage-empty"><h3>Error</h3><p>{error}</p></div>;
  if (!state) return <div className="manage-empty"><h3>Event not found</h3></div>;

  return (
    <div>
      <h1 className="manage-page-title">Edit Event</h1>
      <EventForm mode="edit" initialState={state} />
    </div>
  );
}
