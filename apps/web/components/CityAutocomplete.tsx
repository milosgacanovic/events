"use client";

import { useEffect, useRef, useState } from "react";

import { fetchJson } from "../lib/api";

/**
 * Selected location yielded by the autocomplete. `lat`/`lng` are nullable so a user
 * can pick a "local catalog only" suggestion that lacks coordinates without us pretending
 * we know its location. Country code is ISO-2 lowercase to match what the catalog uses.
 */
export type CitySelection = {
  label: string;
  city: string;
  countryCode: string | null;
  lat: number | null;
  lng: number | null;
};

type SuggestItem = {
  label: string;
  city: string;
  countryCode: string | null;
  lat: number;
  lng: number;
  source: "local" | "geocode";
};

type Props = {
  value: CitySelection | null;
  onChange: (selection: CitySelection | null) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Optional id forwarded to the input — useful for `<label htmlFor>`. */
  inputId?: string;
};

/**
 * Combobox-style city picker backed by `/suggest/cities`. Local catalog matches first,
 * Nominatim fallback for long-tail queries. Selecting a suggestion locks in lat/lng so
 * downstream consumers (e.g. the Follow alert) get a real geographic point.
 *
 * The component renders the human label of the current selection while letting the user
 * clear and re-search by typing. We deliberately don't try to be a fully accessible
 * combobox (no aria-activedescendant, no keyboard navigation across options) — the existing
 * EventSearchClient picker has the same shape and we want consistency for now.
 */
export function CityAutocomplete({ value, onChange, placeholder, disabled, inputId }: Props) {
  const [query, setQuery] = useState(value?.label ?? "");
  const [items, setItems] = useState<SuggestItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When the parent swaps `value` in (e.g. profile pre-fill), reflect it in the input.
  useEffect(() => {
    setQuery(value?.label ?? "");
  }, [value?.label]);

  // Debounced suggest fetch. The 220 ms window matches what feels natural with our
  // network — short enough that suggestions appear as the user keeps typing, long
  // enough that single-character typos don't trigger geocode fallbacks.
  useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length === 0 || trimmed === value?.label) {
      setItems([]);
      return;
    }
    const handle = window.setTimeout(() => {
      setLoading(true);
      fetchJson<{ items: SuggestItem[] }>(
        `/suggest/cities?q=${encodeURIComponent(trimmed)}&limit=8`,
      )
        .then((response) => setItems(response.items ?? []))
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    }, 220);
    return () => window.clearTimeout(handle);
  }, [query, open, value?.label]);

  function handleSelect(item: SuggestItem) {
    onChange({
      label: item.label,
      city: item.city,
      countryCode: item.countryCode,
      lat: item.lat,
      lng: item.lng,
    });
    setQuery(item.label);
    setOpen(false);
    inputRef.current?.blur();
  }

  function handleClear() {
    onChange(null);
    setQuery("");
    setItems([]);
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
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay close so click on a suggestion still registers — same trick the
          // existing EventSearchClient picker uses.
          blurTimerRef.current = setTimeout(() => setOpen(false), 120);
        }}
        onChange={(event) => {
          if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
          setQuery(event.target.value);
          if (value) onChange(null); // Typing invalidates the previous selection.
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
      {open && items.length > 0 && (
        <div className="autocomplete-menu">
          {items.map((item) => (
            <button
              key={`${item.city}|${item.countryCode ?? ""}|${item.source}`}
              type="button"
              className="autocomplete-option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => handleSelect(item)}
            >
              <span>{item.label}</span>
              {item.source === "geocode" && (
                <span className="autocomplete-option-source"> · OpenStreetMap</span>
              )}
            </button>
          ))}
        </div>
      )}
      {open && !loading && items.length === 0 && query.trim().length > 0 && query.trim() !== value?.label && (
        <div className="autocomplete-menu">
          <div className="autocomplete-empty">No matches</div>
        </div>
      )}
    </div>
  );
}
