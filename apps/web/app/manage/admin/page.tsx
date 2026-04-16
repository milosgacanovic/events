import { redirect } from "next/navigation";

export default function AdminManageIndex() {
  redirect("/manage/admin/events");
}
