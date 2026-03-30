"use client";

import { useMemo, useState } from "react";

export type MultiSelectOption = {
  value: string;
  label: string;
};

export function SearchableMultiSelect({
  label,
  options,
  selectedValues,
  onChange,
  placeholder,
}: {
  label: string;
  options: MultiSelectOption[];
  selectedValues: string[];
  onChange: (nextValues: string[]) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return options.filter((option) => {
      if (!normalized) return true;
      return option.label.toLowerCase().includes(normalized) || option.value.toLowerCase().includes(normalized);
    });
  }, [options, query]);

  const selectedOptions = useMemo(() => {
    const map = new Map(options.map((option) => [option.value, option]));
    return selectedValues
      .map((value) => map.get(value))
      .filter((item): item is MultiSelectOption => Boolean(item));
  }, [options, selectedValues]);

  return (
    <div className="searchable-multiselect">
      <label>{label}</label>
      <button
        type="button"
        className="ghost-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {selectedOptions.length > 0 ? `${selectedOptions.length} selected` : placeholder}
      </button>
      {selectedOptions.length > 0 && (
        <div className="kv" style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {selectedOptions.map((option) => (
            <button
              className="tag"
              type="button"
              key={`${label}-chip-${option.value}`}
              onClick={() => onChange(selectedValues.filter((v) => v !== option.value))}
            >
              {option.label} ×
            </button>
          ))}
        </div>
      )}
      {open && (
        <div className="panel">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            onKeyDown={(event) => {
              if (event.key === "Backspace" && query.length === 0 && selectedValues.length > 0) {
                onChange(selectedValues.slice(0, selectedValues.length - 1));
              }
            }}
          />
          <div className="kv" style={{ maxHeight: 220, overflowY: "auto" }}>
            {filtered.map((option) => (
              <label className="meta" key={`${label}-${option.value}`}>
                <input
                  type="checkbox"
                  checked={selectedSet.has(option.value)}
                  onChange={() =>
                    onChange(
                      selectedSet.has(option.value)
                        ? selectedValues.filter((v) => v !== option.value)
                        : [...selectedValues, option.value],
                    )
                  }
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
