"use client";

import { EventForm } from "../../../../components/manage/EventForm";

export default function CreateEventPage() {
  return (
    <div>
      <h1 className="manage-page-title">Create Event</h1>
      <EventForm mode="create" />
    </div>
  );
}
