"use client";

import { useCallback, useEffect, useLayoutEffect, useSyncExternalStore } from "react";

import { getThemeCookie, setThemeCookie, type Theme } from "./theme/cookie";

const LEGACY_STORAGE_KEY = "dr-theme";

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

function getStored(): Theme | null {
  const cookie = getThemeCookie();
  if (cookie) return cookie;
  try {
    const val = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (val === "light" || val === "dark") return val;
  } catch {}
  return null;
}

function getResolved(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = getStored();
  if (stored) return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function apply(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
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

function getSnapshot(): Theme {
  if (typeof document === "undefined") return "light";
  return (document.documentElement.getAttribute("data-theme") as Theme) || "light";
}

function getServerSnapshot(): Theme {
  return "light";
}

export function useTheme() {
  const resolved = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Reapply correct theme after hydration (safety net for FOUC)
  useIsomorphicLayoutEffect(() => {
    const correct = getResolved();
    if (document.documentElement.getAttribute("data-theme") !== correct) {
      apply(correct);
      emit();
    }
  }, []);

  // One-shot migration: copy legacy localStorage value into the shared cookie
  useEffect(() => {
    if (getThemeCookie()) return;
    try {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy === "light" || legacy === "dark") setThemeCookie(legacy);
    } catch {}
  }, []);

  // Listen for OS preference changes (for users who never explicitly chose)
  useEffect(() => {
    if (getStored()) return; // User made explicit choice, ignore OS changes
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      apply(mq.matches ? "dark" : "light");
      emit();
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = getSnapshot() === "dark" ? "light" : "dark";
    setThemeCookie(next);
    apply(next);
    emit();
  }, []);

  return { resolved, toggle } as const;
}
