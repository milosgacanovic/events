"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useKeycloakAuth } from "../../../../components/auth/KeycloakAuthProvider";
import { HostForm, hostFormStateFromApi, type AdminOrganizerDetailResponse, type HostFormState } from "../../../../components/manage/HostForm";
import { StatusBadge } from "../../../../components/manage/StatusBadge";
import { authorizedGet } from "../../../../lib/manageApi";

type LinkedEvent = {
  id: string;
  slug: string;
  title: string;
  status: string;
  next_occurrence: string | null;
};

export default function EditHostPage() {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useKeycloakAuth();
  const [state, setState] = useState<HostFormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [linkedEvents, setLinkedEvents] = useState<LinkedEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await authorizedGet<AdminOrganizerDetailResponse>(getToken, `/admin/organizers/${id}`);
      setState(hostFormStateFromApi(data));

      // Fetch events linked to this host
      setEventsLoading(true);
      try {
        const eventsData = await authorizedGet<{ items: LinkedEvent[] }>(
          getToken,
          `/admin/events?organizerId=${id}&pageSize=20&showUnlisted=true`,
        );
        setLinkedEvents(eventsData.items ?? []);
      } catch {
        // ignore events fetch failure
      } finally {
        setEventsLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load host");
    } finally {
      setLoading(false);
    }
  }, [getToken, id]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="manage-loading">Loading host...</div>;
  if (error) return <div className="manage-empty"><h3>Error</h3><p>{error}</p></div>;
  if (!state) return <div className="manage-empty"><h3>Host not found</h3></div>;

  return (
    <div>
      <Link href="/manage/hosts" className="manage-back-link">← Back to My Hosts</Link>
      <h1 className="manage-page-title">Edit Host</h1>
      <HostForm mode="edit" initialState={state} />

      {/* This Host's Events */}
      <div style={{ marginTop: 32, borderTop: "1px solid var(--border)", paddingTop: 24 }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: 12 }}>This Host&apos;s Events</h2>
        {eventsLoading ? (
          <div className="manage-loading" style={{ padding: 16 }}>Loading events...</div>
        ) : linkedEvents.length === 0 ? (
          <div className="manage-empty" style={{ padding: "16px 0", textAlign: "left" }}>
            <p>No events linked to this host.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {linkedEvents.map((event) => (
              <div
                key={event.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "var(--surface, #f8f8f8)",
                }}
              >
                <div>
                  <span style={{ fontWeight: 500 }}>{event.title}</span>
                  {event.next_occurrence && (
                    <span className="meta" style={{ marginLeft: 8, fontSize: "0.82rem" }}>
                      Next: {new Date(event.next_occurrence).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <StatusBadge status={event.status} />
                  <Link href={`/manage/events/${event.id}`} className="ghost-btn" style={{ fontSize: "0.82rem" }}>
                    Edit
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
