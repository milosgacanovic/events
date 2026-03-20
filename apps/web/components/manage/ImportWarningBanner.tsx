"use client";

import { useRef } from "react";

export function ImportWarningBanner({
  isDetached,
  importSource,
  onDetach,
}: {
  isDetached: boolean;
  importSource: string | null;
  onDetach?: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  if (isDetached) {
    return (
      <div
        className="manage-import-banner"
        style={{
          padding: "12px 16px",
          borderRadius: 6,
          backgroundColor: "var(--info-bg, #e8f4fd)",
          border: "1px solid var(--info-border, #b3d9f2)",
          marginBottom: 16,
        }}
      >
        <strong>Detached from import</strong>
        <p style={{ margin: "4px 0 0" }}>
          This event was originally imported{importSource ? ` from ${importSource}` : ""} but has been detached.
          Future imports will no longer update this event.
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        className="manage-import-banner"
        style={{
          padding: "12px 16px",
          borderRadius: 6,
          backgroundColor: "var(--warning-bg, #fef9e6)",
          border: "1px solid var(--warning-border, #e6d88a)",
          marginBottom: 16,
        }}
      >
        <strong>Imported event</strong>
        <p style={{ margin: "4px 0 0" }}>
          This event is synced from {importSource ?? "an external source"}.
          Editing will detach it from future imports.
        </p>
        {onDetach && (
          <button
            type="button"
            className="secondary-btn"
            style={{ marginTop: 8 }}
            onClick={() => dialogRef.current?.showModal()}
          >
            I understand, proceed with editing
          </button>
        )}
      </div>

      {onDetach && (
        <dialog
          ref={dialogRef}
          style={{
            padding: 24,
            borderRadius: 8,
            border: "1px solid var(--border)",
            maxWidth: 440,
          }}
        >
          <h3 style={{ marginTop: 0 }}>Detach from import?</h3>
          <p>
            This will permanently detach this event from its import source
            ({importSource ?? "external source"}). Future syncs will no longer update this event.
          </p>
          <p style={{ fontWeight: 600 }}>This action cannot be undone.</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary-btn"
              onClick={() => {
                dialogRef.current?.close();
                onDetach();
              }}
            >
              Detach and edit
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
