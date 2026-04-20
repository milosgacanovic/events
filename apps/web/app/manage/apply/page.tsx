"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ROLE_EDITOR } from "@dr-events/shared";

import { useKeycloakAuth } from "../../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../../components/i18n/I18nProvider";
import { authorizedPost } from "../../../lib/manageApi";
import { apiBase } from "../../../lib/api";

type PracticeCategory = { id: string; key: string; label: string };
type TaxonomyResponse = {
  practices: {
    categories: PracticeCategory[];
  };
};

type HostSearchResult = { id: string; name: string; slug: string };

export default function ApplyPage() {
  const auth = useKeycloakAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [name, setName] = useState("");
  const [intent, setIntent] = useState("teach_classes");
  const [intentOther, setIntentOther] = useState("");
  const [description, setDescription] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [practiceCategoryIds, setPracticeCategoryIds] = useState<string[]>([]);
  const [claimHostId, setClaimHostId] = useState<string | null>(null);
  const [claimHostName, setClaimHostName] = useState("");
  const [hostSearch, setHostSearch] = useState("");
  const [hostResults, setHostResults] = useState<HostSearchResult[]>([]);
  const [hostSearching, setHostSearching] = useState(false);
  const [practices, setPractices] = useState<PracticeCategory[]>([]);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const isEditor = auth.roles.includes(ROLE_EDITOR);
  const email = auth.userEmail ?? "";

  useEffect(() => {
    if (isEditor) {
      router.replace("/manage/events/new");
    }
  }, [isEditor, router]);

  // Load practices
  useEffect(() => {
    fetch(`${apiBase}/meta/taxonomies`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: TaxonomyResponse) => setPractices(d.practices.categories))
      .catch(() => {});
  }, []);

  // Host search
  const searchHosts = useCallback(async (q: string) => {
    if (q.length < 2) { setHostResults([]); return; }
    setHostSearching(true);
    try {
      const res = await fetch(`${apiBase}/organizers/search?q=${encodeURIComponent(q)}&pageSize=5`, { cache: "no-store" });
      const data = (await res.json()) as { items: HostSearchResult[] };
      setHostResults(data.items ?? []);
    } catch {
      // ignore
    } finally {
      setHostSearching(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void searchHosts(hostSearch); }, 300);
    return () => clearTimeout(timer);
  }, [hostSearch, searchHosts]);

  if (!auth.ready) return <div className="manage-loading">{t("manage.common.loading")}</div>;

  if (!auth.authenticated) {
    return (
      <div className="manage-empty" style={{ maxWidth: 480, textAlign: "center" }}>
        <h3>{t("manage.apply.loginRequired")}</h3>
        <p style={{ marginBottom: 24, color: "var(--muted)", lineHeight: 1.6 }}>
          {t("manage.apply.loginRequiredMessage")}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
          <button
            className="primary-btn"
            onClick={() => void auth.login()}
          >
            {t("nav.login")}
          </button>
          <button
            type="button"
            onClick={() => void auth.register()}
            style={{ background: "none", border: 0, padding: 0, color: "var(--muted)", textDecoration: "underline", cursor: "pointer", font: "inherit" }}
          >
            {t("nav.signUpPrompt")}
          </button>
        </div>
      </div>
    );
  }

  useEffect(() => {
    if (submitted) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [submitted]);

  if (submitted) {
    return (
      <div className="manage-empty">
        <h3>{t("manage.apply.submitted")}</h3>
        <p>{t("manage.apply.submittedMessage")}</p>
      </div>
    );
  }

  function togglePractice(id: string) {
    setPracticeCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await authorizedPost(auth.getToken, "/admin/applications", {
        name,
        email,
        intent,
        intentOther: intent === "other" ? intentOther : undefined,
        description,
        proofUrl: proofUrl || undefined,
        practiceCategoryIds: practiceCategoryIds.length > 0 ? practiceCategoryIds : undefined,
        claimHostId: claimHostId || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 600, width: "100%" }}>
      <h1 className="manage-page-title">{t("manage.apply.title")}</h1>
      <p style={{ marginBottom: 24, color: "var(--muted)" }}>
        {t("manage.apply.subtitle")}
      </p>

      <form className="manage-form" onSubmit={(e) => void handleSubmit(e)}>
        <div>
          <label>{t("manage.apply.labelName")}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label>{t("manage.apply.labelEmail")}</label>
          <input type="email" value={email} disabled style={{ opacity: 0.7, cursor: "not-allowed" }} />
        </div>
        <div>
          <label>{t("manage.apply.labelIntent")}</label>
          <select value={intent} onChange={(e) => setIntent(e.target.value)}>
            <option value="organize_events">{t("manage.apply.intentOrganize")}</option>
            <option value="teach_classes">{t("manage.apply.intentTeach")}</option>
            <option value="manage_venue">{t("manage.apply.intentVenue")}</option>
            <option value="community">{t("manage.apply.intentCommunity")}</option>
            <option value="other">{t("manage.apply.intentOther")}</option>
          </select>
        </div>
        {intent === "other" && (
          <div>
            <label>{t("manage.apply.intentOtherDescribe")}</label>
            <input value={intentOther} onChange={(e) => setIntentOther(e.target.value)} />
          </div>
        )}
        <div>
          <label>{t("manage.apply.labelDescription")}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder={t("manage.apply.descriptionPlaceholder")}
          />
        </div>

        {/* Practice categories as chips */}
        {practices.length > 0 && (
          <div>
            <label>{t("manage.apply.labelPractices")}</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {practices.map((p) => {
                const selected = practiceCategoryIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePractice(p.id)}
                    style={{
                      padding: "6px 16px",
                      borderRadius: 999,
                      border: `1.5px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                      background: selected ? "var(--accent-bg)" : "transparent",
                      color: selected ? "var(--accent)" : "var(--ink)",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                      fontWeight: selected ? 600 : 400,
                      transition: "all 0.15s ease",
                    }}
                  >
                    {selected && "✓ "}{p.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Host claim */}
        <div>
          <label>{t("manage.apply.labelHost")}</label>
          {claimHostId ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <span>{claimHostName}</span>
              <button type="button" className="ghost-btn" style={{ fontSize: "0.8rem" }} onClick={() => { setClaimHostId(null); setClaimHostName(""); }}>
                {t("manage.common.remove")}
              </button>
            </div>
          ) : (
            <>
              <input
                value={hostSearch}
                onChange={(e) => setHostSearch(e.target.value)}
                placeholder={t("manage.apply.hostSearchPlaceholder")}
              />
              {hostSearching && <span className="meta">{t("manage.apply.hostSearching")}</span>}
              {hostResults.length > 0 && (
                <div style={{ border: "1px solid var(--border)", borderRadius: 6, marginTop: 4, maxHeight: 160, overflow: "auto", background: "var(--surface)" }}>
                  {hostResults.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => { setClaimHostId(h.id); setClaimHostName(h.name); setHostSearch(""); setHostResults([]); }}
                      style={{ display: "block", width: "100%", padding: "8px 12px", textAlign: "left", border: "none", background: "transparent", color: "var(--ink)", cursor: "pointer" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover-bg)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      {h.name}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div>
          <label>{t("manage.apply.labelProofUrl")}</label>
          <input value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} placeholder="https://..." />
        </div>

        <div className="manage-form-actions" style={{ position: "static" }}>
          <button type="submit" className="primary-btn" disabled={saving}>
            {saving ? t("manage.apply.submitting") : t("manage.apply.submit")}
          </button>
        </div>

        {error && <div className="meta" style={{ color: "var(--danger, #c53030)" }}>{error}</div>}
      </form>
    </div>
  );
}
