"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function SubsubmenuPortal({ children }: { children: React.ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setSlot(document.getElementById("manage-subsubmenu-slot"));
  }, []);

  if (!slot) return null;
  return createPortal(children, slot);
}
