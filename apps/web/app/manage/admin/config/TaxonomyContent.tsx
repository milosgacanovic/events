"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useKeycloakAuth } from "../../../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../../../components/i18n/I18nProvider";
import { authorizedDelete, authorizedPost, authorizedPatch } from "../../../../lib/manageApi";
import { deriveTaxonomyKey } from "../../../../lib/formUtils";
import { apiBase } from "../../../../lib/api";

type TaxItem = { id: string; key: string; label: string; sort_order?: number };
type TaxonomyResponse = {
  uiLabels: { categorySingular?: string; categoryPlural?: string };
  practices: {
    categories: Array<TaxItem & {
      subcategories: Array<TaxItem>;
    }>;
  };
  organizerRoles: Array<TaxItem>;
  eventFormats?: Array<TaxItem>;
};

export type TaxonomyTab = "practices" | "formats" | "roles" | "labels";

export function TaxonomyContent({ tab }: { tab: TaxonomyTab }) {
  const { getToken } = useKeycloakAuth();
  const { t } = useI18n();
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  const [practiceLevel, setPracticeLevel] = useState<"1" | "2">("1");
  const [practiceParentId, setPracticeParentId] = useState("");
  const [practiceLabel, setPracticeLabel] = useState("");
  const [practiceKey, setPracticeKey] = useState("");

  const [roleKey, setRoleKey] = useState("");
  const [roleLabel, setRoleLabel] = useState("");

  const [formatKey, setFormatKey] = useState("");
  const [formatLabel, setFormatLabel] = useState("");

  const [catSingular, setCatSingular] = useState("");
  const [catPlural, setCatPlural] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<{ endpoint: string; id: string; label: string } | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const deleteDialogRef = useRef<HTMLDialogElement>(null);

  const [dragEndpoint, setDragEndpoint] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const loadTaxonomy = useCallback(async () => {
    try {
      const data = await fetch(`${apiBase}/meta/taxonomies`, { cache: "no-store" }).then((r) => r.json()) as TaxonomyResponse;
      setTaxonomy(data);
      setCatSingular(data.uiLabels.categorySingular ?? "");
      setCatPlural(data.uiLabels.categoryPlural ?? "");
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadTaxonomy(); }, [loadTaxonomy]);

  async function createPractice(e: React.FormEvent) {
    e.preventDefault();
    try {
      const key = practiceKey || deriveTaxonomyKey(practiceLabel);
      await authorizedPost(getToken, "/admin/practices", {
        level: Number(practiceLevel),
        parentId: practiceLevel === "2" ? practiceParentId : null,
        key,
        label: practiceLabel,
        sortOrder: 0,
        isActive: true,
      });
      setPracticeLabel("");
      setPracticeKey("");
      setStatus("Practice created!");
      void loadTaxonomy();
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : "Failed"}`);
    }
  }

  async function createRole(e: React.FormEvent) {
    e.preventDefault();
    try {
      await authorizedPost(getToken, "/admin/organizer-roles", {
        key: roleKey,
        label: roleLabel,
        sortOrder: 0,
        isActive: true,
      });
      setRoleKey("");
      setRoleLabel("");
      setStatus("Role created!");
      void loadTaxonomy();
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : "Failed"}`);
    }
  }

  async function createFormat(e: React.FormEvent) {
    e.preventDefault();
    try {
      await authorizedPost(getToken, "/admin/event-formats", {
        key: formatKey,
        label: formatLabel,
        sortOrder: 0,
        isActive: true,
      });
      setFormatKey("");
      setFormatLabel("");
      setStatus("Format created!");
      void loadTaxonomy();
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : "Failed"}`);
    }
  }

  async function saveLabels(e: React.FormEvent) {
    e.preventDefault();
    try {
      await authorizedPatch(getToken, "/admin/ui-labels", {
        categorySingular: catSingular,
        categoryPlural: catPlural,
      });
      setStatus("Labels saved!");
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : "Failed"}`);
    }
  }

  async function handleInlineEdit(endpoint: string, id: string) {
    try {
      await authorizedPatch(getToken, `${endpoint}/${id}`, { label: editLabel });
      setEditingId(null);
      setEditLabel("");
      setStatus("Updated!");
      void loadTaxonomy();
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : "Failed"}`);
    }
  }

  function handleDeleteClick(endpoint: string, id: string, label: string) {
    setDeleteTarget({ endpoint, id, label });
    setConfirmText("");
    setTimeout(() => deleteDialogRef.current?.showModal(), 0);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await authorizedDelete(getToken, `${deleteTarget.endpoint}/${deleteTarget.id}`);
      setStatus("Deleted!");
      setDeleteTarget(null);
      deleteDialogRef.current?.close();
      void loadTaxonomy();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      setStatus(`Error: ${msg}`);
    }
  }

  function startEdit(id: string, currentLabel: string) {
    setEditingId(id);
    setEditLabel(currentLabel);
  }

  async function handleReorder(endpoint: string, items: TaxItem[], index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const updated = items.map((item, i) => ({
      id: item.id,
      sortOrder: item.sort_order ?? i,
    }));
    const tmp = updated[index].sortOrder;
    updated[index].sortOrder = updated[targetIndex].sortOrder;
    updated[targetIndex].sortOrder = tmp;

    try {
      await authorizedPatch(getToken, `${endpoint}/reorder`, updated);
      setStatus("Reordered!");
      void loadTaxonomy();
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : "Failed"}`);
    }
  }

  async function handleDragDrop(endpoint: string, items: TaxItem[], fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;

    const reordered = [...items];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    const updated = reordered.map((item, i) => ({
      id: item.id,
      sortOrder: i,
    }));

    try {
      await authorizedPatch(getToken, `${endpoint}/reorder`, updated);
      setStatus("Reordered!");
      void loadTaxonomy();
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : "Failed"}`);
    }
  }

  function onDragStart(endpoint: string, index: number) {
    setDragEndpoint(endpoint);
    setDragIndex(index);
  }

  function onDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    setDragOverIndex(index);
  }

  function onDragEnd() {
    setDragIndex(null);
    setDragOverIndex(null);
    setDragEndpoint(null);
  }

  function onDrop(endpoint: string, items: TaxItem[], toIndex: number) {
    if (dragIndex !== null && dragEndpoint === endpoint) {
      void handleDragDrop(endpoint, items, dragIndex, toIndex);
    }
    onDragEnd();
  }

  function renderItemRow(id: string, label: string, key: string, endpoint: string, indent: boolean, items?: TaxItem[], index?: number) {
    const isEditing = editingId === id;
    const isDragging = dragIndex === index && dragEndpoint === endpoint;
    const isDragOver = dragOverIndex === index && dragEndpoint === endpoint;

    const className = [
      "manage-taxonomy-item",
      indent ? "manage-taxonomy-item--indent" : "",
      isDragging ? "dragging" : "",
      isDragOver ? "drag-over" : "",
    ].filter(Boolean).join(" ");

    return (
      <div
        key={id}
        className={className}
        draggable={!isEditing && items !== undefined}
        onDragStart={items && index !== undefined ? () => onDragStart(endpoint, index) : undefined}
        onDragOver={items && index !== undefined ? (e) => onDragOver(e, index) : undefined}
        onDragEnd={onDragEnd}
        onDrop={items && index !== undefined ? () => onDrop(endpoint, items, index) : undefined}
      >
        {isEditing ? (
          <>
            <input
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              style={{ flex: 1, fontSize: "0.9rem" }}
            />
            <button type="button" className="primary-btn" style={{ fontSize: "0.75rem", padding: "2px 8px" }} onClick={() => void handleInlineEdit(endpoint, id)}>
              {t("manage.common.save")}
            </button>
            <button type="button" className="ghost-btn" style={{ fontSize: "0.75rem", padding: "2px 8px" }} onClick={() => setEditingId(null)}>
              {t("manage.common.cancel")}
            </button>
          </>
        ) : (
          <>
            <span style={{ flex: 1 }}>
              {indent ? "" : <strong>{label}</strong>}
              {indent && <span className="meta">{label}</span>}
              {!indent && <span className="meta"> ({key})</span>}
              {indent && <span className="meta"> ({key})</span>}
            </span>
            {items && index !== undefined && index > 0 && (
              <button type="button" className="ghost-btn" style={{ fontSize: "0.75rem", padding: "2px 6px" }} onClick={() => void handleReorder(endpoint, items, index, "up")} title={t("manage.admin.taxonomies.moveUp")}>
                ↑
              </button>
            )}
            {items && index !== undefined && index < items.length - 1 && (
              <button type="button" className="ghost-btn" style={{ fontSize: "0.75rem", padding: "2px 6px" }} onClick={() => void handleReorder(endpoint, items, index, "down")} title={t("manage.admin.taxonomies.moveDown")}>
                ↓
              </button>
            )}
            <button type="button" className="ghost-btn" style={{ fontSize: "0.75rem", padding: "2px 8px" }} onClick={() => startEdit(id, label)}>
              {t("manage.common.edit")}
            </button>
            <button type="button" className="ghost-btn" style={{ fontSize: "0.75rem", padding: "2px 8px", color: "var(--danger, #c53030)" }} onClick={() => handleDeleteClick(endpoint, id, label)}>
              {t("manage.common.delete")}
            </button>
          </>
        )}
      </div>
    );
  }

  if (loading) return <div className="manage-loading">{t("manage.common.loading")}</div>;

  return (
    <div>
      {tab === "practices" && (
        <div>
          <h2 className="manage-section-heading">{t("manage.admin.taxonomies.existing", { type: t("manage.admin.taxonomies.dancePractices") })}</h2>
          {taxonomy?.practices.categories.map((cat, catIdx) => (
            <div key={cat.id} style={{ marginBottom: 12 }}>
              {renderItemRow(cat.id, cat.label, cat.key, "/admin/practices", false, taxonomy.practices.categories, catIdx)}
              {cat.subcategories.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  {cat.subcategories.map((sub, subIdx) =>
                    renderItemRow(sub.id, sub.label, sub.key, "/admin/practices", true, cat.subcategories, subIdx),
                  )}
                </div>
              )}
            </div>
          ))}
          <h2 className="manage-section-heading manage-section-heading--spaced">{t("manage.admin.taxonomies.create", { type: t("manage.admin.taxonomies.dancePractices") })}</h2>
          <form className="manage-form" onSubmit={(e) => void createPractice(e)}>
            <div>
              <label>{t("manage.admin.taxonomies.level")}</label>
              <select value={practiceLevel} onChange={(e) => setPracticeLevel(e.target.value as "1" | "2")}>
                <option value="1">{t("manage.admin.taxonomies.category")}</option>
                <option value="2">{t("manage.admin.taxonomies.subcategory")}</option>
              </select>
            </div>
            {practiceLevel === "2" && (
              <div>
                <label>{t("manage.admin.taxonomies.parentCategory")}</label>
                <select value={practiceParentId} onChange={(e) => setPracticeParentId(e.target.value)} required>
                  <option value="">{t("manage.admin.taxonomies.selectParent")}</option>
                  {taxonomy?.practices.categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label>{t("common.field.label")}</label>
              <input value={practiceLabel} onChange={(e) => setPracticeLabel(e.target.value)} required />
            </div>
            <div>
              <label>{t("common.field.key")} ({t("manage.admin.taxonomies.keyAutoGenerated")})</label>
              <input value={practiceKey} onChange={(e) => setPracticeKey(e.target.value)} placeholder={deriveTaxonomyKey(practiceLabel || "example")} />
            </div>
            <button type="submit" className="primary-btn">{t("manage.admin.taxonomies.create", { type: t("manage.admin.taxonomies.dancePractices") })}</button>
          </form>
        </div>
      )}

      {tab === "formats" && (
        <div>
          <h2 className="manage-section-heading">{t("manage.admin.taxonomies.existing", { type: t("manage.admin.taxonomies.eventFormats") })}</h2>
          {taxonomy?.eventFormats?.map((f, fIdx) =>
            renderItemRow(f.id, f.label, f.key, "/admin/event-formats", false, taxonomy?.eventFormats, fIdx),
          )}
          <h2 className="manage-section-heading manage-section-heading--spaced">{t("manage.admin.taxonomies.create", { type: t("manage.admin.taxonomies.eventFormats") })}</h2>
          <form className="manage-form" onSubmit={(e) => void createFormat(e)}>
            <div>
              <label>{t("common.field.key")}</label>
              <input value={formatKey} onChange={(e) => setFormatKey(e.target.value)} required />
            </div>
            <div>
              <label>{t("common.field.label")}</label>
              <input value={formatLabel} onChange={(e) => setFormatLabel(e.target.value)} required />
            </div>
            <button type="submit" className="primary-btn">{t("manage.admin.taxonomies.create", { type: t("manage.admin.taxonomies.eventFormats") })}</button>
          </form>
        </div>
      )}

      {tab === "roles" && (
        <div>
          <h2 className="manage-section-heading">{t("manage.admin.taxonomies.existing", { type: t("manage.admin.taxonomies.hostRoles") })}</h2>
          {taxonomy?.organizerRoles.map((r, rIdx) =>
            renderItemRow(r.id, r.label, r.key, "/admin/organizer-roles", false, taxonomy?.organizerRoles, rIdx),
          )}
          <h2 className="manage-section-heading manage-section-heading--spaced">{t("manage.admin.taxonomies.create", { type: t("manage.admin.taxonomies.hostRoles") })}</h2>
          <form className="manage-form" onSubmit={(e) => void createRole(e)}>
            <div>
              <label>{t("common.field.key")}</label>
              <input value={roleKey} onChange={(e) => setRoleKey(e.target.value)} required />
            </div>
            <div>
              <label>{t("common.field.label")}</label>
              <input value={roleLabel} onChange={(e) => setRoleLabel(e.target.value)} required />
            </div>
            <button type="submit" className="primary-btn">{t("manage.admin.taxonomies.create", { type: t("manage.admin.taxonomies.hostRoles") })}</button>
          </form>
        </div>
      )}

      {tab === "labels" && (
        <form className="manage-form" onSubmit={(e) => void saveLabels(e)}>
          <div>
            <label>{t("manage.admin.taxonomies.categorySingular")}</label>
            <input value={catSingular} onChange={(e) => setCatSingular(e.target.value)} />
          </div>
          <div>
            <label>{t("manage.admin.taxonomies.categoryPlural")}</label>
            <input value={catPlural} onChange={(e) => setCatPlural(e.target.value)} />
          </div>
          <button type="submit" className="primary-btn">{t("manage.admin.taxonomies.saveLabels")}</button>
        </form>
      )}

      {status && <div className="meta" style={{ padding: "8px 0" }}>{status}</div>}

      <dialog ref={deleteDialogRef} className="manage-dialog">
        {deleteTarget && (
          <>
            <h3>{t("manage.admin.taxonomies.confirmDeleteTitle")}</h3>
            <p style={{ marginBottom: 16, fontSize: "0.9rem" }}>
              {t("manage.admin.taxonomies.confirmDelete", { label: deleteTarget.label })}
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: 4 }}>
                {t("manage.admin.taxonomies.confirmDeletePrompt", { label: deleteTarget.label })}
              </label>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={deleteTarget.label}
                autoFocus
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  border: "1px solid var(--border, #e0e0e0)",
                  borderRadius: 6,
                  fontSize: "0.9rem",
                }}
              />
            </div>
            <div className="manage-dialog-actions">
              <button
                type="button"
                className="ghost-btn"
                onClick={() => { setDeleteTarget(null); deleteDialogRef.current?.close(); }}
              >
                {t("manage.common.cancel")}
              </button>
              <button
                type="button"
                className="primary-btn"
                disabled={confirmText !== deleteTarget.label}
                style={{
                  background: confirmText === deleteTarget.label ? "var(--danger, #c53030)" : undefined,
                  opacity: confirmText === deleteTarget.label ? 1 : 0.5,
                }}
                onClick={() => void confirmDelete()}
              >
                {t("manage.common.delete")}
              </button>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
