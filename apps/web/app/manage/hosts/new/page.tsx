"use client";

import Link from "next/link";

import { HostForm } from "../../../../components/manage/HostForm";

export default function CreateHostPage() {
  return (
    <div>
      <Link href="/manage/hosts" className="manage-back-link">← Back to My Hosts</Link>
      <h1 className="manage-page-title">Create Host</h1>
      <HostForm mode="create" />
    </div>
  );
}
