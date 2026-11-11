"use client";

import { useCallback, useEffect, useState } from "react";

import type { TimeDisplayMode } from "./datetime";
import { getUserTimeZone, readTimeDisplayMode, writeTimeDisplayMode } from "./timeDisplay";

/**
 * The visitor's "Event time / Your time" preference, hydration-safe.
 *
 * The server can't see localStorage or the browser's timezone, so the first
 * client render must use the same values the server did ("event" mode,
 * "UTC"); the stored preference and the real timezone are applied right
 * after mount. Reading localStorage in a useState initializer made every
 * date on event pages differ from the server HTML for visitors who had once
 * picked "Your time" (React #425/#418/#423, whole page re-rendered).
 *
 * The preference is persisted only when the visitor changes it (setMode),
 * so loading the stored value never writes back a default.
 */
export function useTimeDisplayPreference(): {
  mode: TimeDisplayMode;
  setMode: (mode: TimeDisplayMode) => void;
  userTimeZone: string;
} {
  const [mode, setModeState] = useState<TimeDisplayMode>("event");
  const [userTimeZone, setUserTimeZone] = useState("UTC");

  useEffect(() => {
    setModeState(readTimeDisplayMode());
    setUserTimeZone(getUserTimeZone());
  }, []);

  const setMode = useCallback((next: TimeDisplayMode) => {
    setModeState(next);
    writeTimeDisplayMode(next);
  }, []);

  return { mode, setMode, userTimeZone };
}
