"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { fetchJson } from "../lib/api";
import { useI18n } from "./i18n/I18nProvider";
import { getLocalizedRegionLabel } from "../lib/i18n/icuFallback";

/**
 * Searchable country picker. Returns ISO-2 lowercase ("rs") to match what the
 * platform stores everywhere else. Country labels come from `Intl.DisplayNames` in the
 * current UI locale (with the existing icuFallback for Chrome ICU gaps), so users see
 * "Сербия" in Russian and "Serbia" in English without us shipping a translation table.
 *
 * The catalog endpoint `/suggest/countries` ranks codes by how many published events we
 * have in each country — that's what shows at the top before the user types. Once they
 * type, we filter against the localized labels (substring match, case-insensitive).
 */

type Props = {
  value: string | null;
  onChange: (code: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  inputId?: string;
};

export function CountryCombobox({ value, onChange, placeholder, disabled, inputId }: Props) {
  const { locale } = useI18n();
  const [codes, setCodes] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cache the DisplayNames instance per locale — instantiation is non-trivial.
  const displayNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      return null;
    }
  }, [locale]);

  useEffect(() => {
    fetchJson<{ items: Array<{ code: string; count: number }> }>(`/suggest/countries`)
      .then((response) => setCodes(response.items.map((item) => item.code)))
      .catch(() => setCodes([]));
  }, []);

  const labelByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const code of codes) {
      map.set(code, getLocalizedRegionLabel(code, locale, displayNames));
    }
    return map;
  }, [codes, locale, displayNames]);

  const selectedLabel = value ? labelByCode.get(value) ?? value.toUpperCase() : "";

  // Show the selected label in the input when not actively typing, so users see what
  // they picked. As soon as they focus & type, we treat the input as a search query.
  useEffect(() => {
    if (!open) setQuery(selectedLabel);
  }, [selectedLabel, open]);

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed || trimmed === selectedLabel.toLowerCase()) {
      return codes.slice(0, 12);
    }
    return codes
      .filter((code) => {
        const label = labelByCode.get(code) ?? "";
        return label.toLowerCase().includes(trimmed) || code.includes(trimmed);
      })
      .slice(0, 12);
  }, [query, codes, labelByCode, selectedLabel]);

  function handleSelect(code: string) {
    onChange(code);
    setQuery(labelByCode.get(code) ?? code.toUpperCase());
    setOpen(false);
    inputRef.current?.blur();
  }

  function handleClear() {
    onChange(null);
    setQuery("");
    inputRef.current?.focus();
  }

  return (
    <div className={`autocomplete-wrap${disabled ? " autocomplete-wrap--disabled" : ""}`}>
      <input
        id={inputId}
        ref={inputRef}
        type="text"
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => {
          // Clear so the user can search instantly without first deleting.
          if (value) setQuery("");
          setOpen(true);
        }}
        onBlur={() => {
          blurTimerRef.current = setTimeout(() => setOpen(false), 120);
        }}
        onChange={(event) => {
          if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
          setQuery(event.target.value);
          setOpen(true);
        }}
      />
      {value && !disabled && (
        <button
          type="button"
          className="autocomplete-clear"
          aria-label="Clear selection"
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleClear}
        >
          ×
        </button>
      )}
      {open && filtered.length > 0 && (
        <div className="autocomplete-menu">
          {filtered.map((code) => (
            <button
              key={code}
              type="button"
              className="autocomplete-option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => handleSelect(code)}
            >
              {labelByCode.get(code) ?? code.toUpperCase()}
              <span className="autocomplete-option-source"> · {code.toUpperCase()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
