import type { TimeDisplayMode } from "./datetime";

export const TIME_DISPLAY_MODE_STORAGE_KEY = "dr-events-time-display-mode";

export function readTimeDisplayMode(): TimeDisplayMode {
  if (typeof window === "undefined") {
    return "user";
  }
  const value = window.localStorage.getItem(TIME_DISPLAY_MODE_STORAGE_KEY);
  return value === "event" ? "event" : "user";
}

export function writeTimeDisplayMode(mode: TimeDisplayMode): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(TIME_DISPLAY_MODE_STORAGE_KEY, mode);
}

export function getUserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
