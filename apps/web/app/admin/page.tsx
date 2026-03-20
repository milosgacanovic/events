"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

const SECTION_MAP: Record<string, string> = {
  events: "/manage/events",
  organizers: "/manage/hosts",
  taxonomies: "/manage/admin/taxonomies",
  users: "/manage/admin/users",
};

export default function AdminRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const section = searchParams.get("section");
    const target = section ? SECTION_MAP[section] ?? "/manage" : "/manage";
    router.replace(target);
  }, [router, searchParams]);

  return <div style={{ padding: 48, textAlign: "center", color: "#888" }}>Redirecting to manage area...</div>;
}
