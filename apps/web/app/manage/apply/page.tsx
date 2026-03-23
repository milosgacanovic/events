"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ROLE_EDITOR } from "@dr-events/shared";

import { useKeycloakAuth } from "../../../components/auth/KeycloakAuthProvider";
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

  if (!auth.ready) return <div className="manage-loading">Loading...</div>;

  if (!auth.authenticated) {
    void auth.login();
    return <div className="manage-loading">Redirecting to login...</div>;
  }

  useEffect(() => {
    if (submitted) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [submitted]);

  if (submitted) {
    return (
      <div className="manage-empty">
        <h3>Application submitted!</h3>
        <p>We&apos;ll review your application and get back to you soon.</p>
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
      <h1 className="manage-page-title">Post Your Event</h1>
      <p style={{ marginBottom: 24, color: "var(--muted)" }}>
        Apply for editor access to publish your dance events on DanceResource.
      </p>

      <form className="manage-form" onSubmit={(e) => void handleSubmit(e)}>
        <div>
          <label>Your Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label>Email</label>
          <input type="email" value={email} disabled style={{ opacity: 0.7, cursor: "not-allowed" }} />
        </div>
        <div>
          <label>What do you want to do?</label>
          <select value={intent} onChange={(e) => setIntent(e.target.value)}>
            <option value="organize_events">I organize dance events</option>
            <option value="teach_classes">I facilitate dance classes</option>
            <option value="manage_venue">I manage a dance venue</option>
            <option value="community">I run a dance community</option>
            <option value="other">Other</option>
          </select>
        </div>
        {intent === "other" && (
          <div>
            <label>Please describe</label>
            <input value={intentOther} onChange={(e) => setIntentOther(e.target.value)} />
          </div>
        )}
        <div>
          <label>Tell us about your events or organization</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="What kind of events do you run? Where are they located?"
          />
        </div>

        {/* Practice categories as chips */}
        {practices.length > 0 && (
          <div>
            <label>What dance styles do you focus on?</label>
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
          <label>Do you manage an existing host on our platform?</label>
          {claimHostId ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <span>{claimHostName}</span>
              <button type="button" className="ghost-btn" style={{ fontSize: "0.8rem" }} onClick={() => { setClaimHostId(null); setClaimHostName(""); }}>
                Remove
              </button>
            </div>
          ) : (
            <>
              <input
                value={hostSearch}
                onChange={(e) => setHostSearch(e.target.value)}
                placeholder="Search for your host/organization..."
              />
              {hostSearching && <span className="meta">Searching...</span>}
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
          <label>Link to your website or social media (optional)</label>
          <input value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} placeholder="https://..." />
        </div>

        <div className="manage-form-actions" style={{ position: "static" }}>
          <button type="submit" className="primary-btn" disabled={saving}>
            {saving ? "Submitting..." : "Submit Application"}
          </button>
        </div>

        {error && <div className="meta" style={{ color: "var(--danger, #c53030)" }}>{error}</div>}
      </form>
    </div>
  );
}
