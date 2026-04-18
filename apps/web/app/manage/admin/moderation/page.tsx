import { redirect } from "next/navigation";

const LEGACY_TAB_MAP: Record<string, string> = {
  comment: "comments",
  edit_suggestion: "suggestions",
  report: "reports",
  application: "applications",
  tag_suggestion: "tag-suggestions",
};

export default function ModerationIndex({ searchParams }: { searchParams?: { tab?: string } }) {
  const target = LEGACY_TAB_MAP[searchParams?.tab ?? ""] ?? "comments";
  redirect(`/manage/admin/moderation/${target}`);
}
