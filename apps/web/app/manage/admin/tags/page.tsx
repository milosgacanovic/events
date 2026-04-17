"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TagSuggestionsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/manage/admin/moderation?tab=tag_suggestion"); }, [router]);
  return null;
}
