"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

type Preference = "light" | "dark" | "system";
type Resolved = "light" | "dark";

const STORAGE_KEY = "dr-theme";

function getPreference(): Preference {
  if (typeof window === "undefined") return "system";
  try {
    return (localStorage.getItem(STORAGE_KEY) as Preference) || "system";
  } catch {
    return "system";
  }
}

function resolve(pref: Preference): Resolved {
  if (pref !== "system") return pref;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function apply(pref: Preference) {
  const resolved = resolve(pref);
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.setAttribute("data-theme-preference", pref);
}

let listeners: Array<() => void> = [];
function subscribe(cb: () => void) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}
function emit() {
  listeners.forEach((l) => l());
}

function getSnapshot(): string {
  if (typeof document === "undefined") return "system|light";
  const pref =
    (document.documentElement.getAttribute("data-theme-preference") as Preference) || "system";
  const resolved =
    (document.documentElement.getAttribute("data-theme") as Resolved) || "light";
  return `${pref}|${resolved}`;
}

function getServerSnapshot(): string {
  return "system|light";
}

export function useTheme() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [preference, resolved] = snap.split("|") as [Preference, Resolved];

  useEffect(() => {
    if (preference !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      apply("system");
      emit();
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [preference]);

  const setTheme = useCallback((next: Preference) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
    apply(next);
    emit();
  }, []);

  const cycle = useCallback(() => {
    const order: Preference[] = ["light", "dark", "system"];
    const idx = order.indexOf(preference);
    setTheme(order[(idx + 1) % order.length]);
  }, [preference, setTheme]);

  return { preference, resolved, setTheme, cycle } as const;
}
