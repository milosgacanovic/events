"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useKeycloakAuth } from "../../../../components/auth/KeycloakAuthProvider";
import { HostForm, hostFormStateFromApi, type AdminOrganizerDetailResponse, type HostFormState } from "../../../../components/manage/HostForm";
import { authorizedGet } from "../../../../lib/manageApi";

export default function EditHostPage() {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useKeycloakAuth();
  const [state, setState] = useState<HostFormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await authorizedGet<AdminOrganizerDetailResponse>(getToken, `/admin/organizers/${id}`);
      setState(hostFormStateFromApi(data));
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
    </div>
  );
}
