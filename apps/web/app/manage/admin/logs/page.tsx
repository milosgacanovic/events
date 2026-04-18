import { redirect } from "next/navigation";

export default function LogsIndex({ searchParams }: { searchParams?: { tab?: string } }) {
  const target = searchParams?.tab === "errors" ? "errors" : "activity";
  redirect(`/manage/admin/logs/${target}`);
}
