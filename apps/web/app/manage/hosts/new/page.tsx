"use client";

import { HostForm } from "../../../../components/manage/HostForm";

export default function CreateHostPage() {
  return (
    <div>
      <h1 className="manage-page-title">Create Host</h1>
      <HostForm mode="create" />
    </div>
  );
}
