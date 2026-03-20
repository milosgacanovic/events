"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useI18n } from "../i18n/I18nProvider";
import { authorizedGet, authorizedPost } from "../../lib/manageApi";

type UserResult = {
  id: string;
  display_name: string | null;
  email: string | null;
};

type UsersResponse = {
  items: UserResult[];
};

export function AssignToUserModal({
  getToken,
  entityType,
  entityId,
  onAssigned,
  onClose,
}: {
  getToken: () => Promise<string | null>;
  entityType: "hosts" | "events";
  entityId: string;
  onAssigned: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const searchUsers = useCallback(async (q: string) => {
    if (q.length < 2) { setUsers([]); return; }
    setLoading(true);
    try {
      const data = await authorizedGet<UsersResponse>(
        getToken,
        `/admin/users?search=${encodeURIComponent(q)}&pageSize=10`,
      );
      setUsers(data.items ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    const timer = setTimeout(() => { void searchUsers(search); }, 300);
    return () => clearTimeout(timer);
  }, [search, searchUsers]);

  async function assign(userId: string) {
    setAssigning(true);
    try {
      const bodyKey = entityType === "hosts" ? "organizerId" : "eventId";
      await authorizedPost(getToken, `/admin/users/${userId}/${entityType}`, {
        [bodyKey]: entityId,
      });
      onAssigned();
      dialogRef.current?.close();
      onClose();
    } catch {
      // ignore
    } finally {
      setAssigning(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      style={{
        padding: 24,
        borderRadius: 8,
        border: "1px solid var(--border)",
        maxWidth: 480,
        width: "100%",
      }}
      onClose={onClose}
    >
      <h3 style={{ marginTop: 0 }}>{t("manage.assignModal.title")}</h3>
      <input
        placeholder={t("manage.assignModal.searchPlaceholder")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: "100%", marginBottom: 12 }}
      />
      {loading && <div className="meta">{t("manage.assignModal.searching")}</div>}
      <div style={{ maxHeight: 240, overflow: "auto" }}>
        {users.map((u) => (
          <div key={u.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <div>
              <div style={{ fontWeight: 500 }}>{u.display_name ?? "(No name)"}</div>
              <div className="meta" style={{ fontSize: "0.8rem" }}>{u.email ?? ""}</div>
            </div>
            <button
              type="button"
              className="primary-btn"
              style={{ fontSize: "0.8rem", padding: "4px 12px" }}
              disabled={assigning}
              onClick={() => void assign(u.id)}
            >
              Assign
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <button type="button" className="ghost-btn" onClick={() => { dialogRef.current?.close(); onClose(); }}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}
