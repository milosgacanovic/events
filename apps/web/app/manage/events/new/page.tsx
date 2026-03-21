"use client";

import Link from "next/link";

import { EventForm } from "../../../../components/manage/EventForm";

export default function CreateEventPage() {
  return (
    <div>
      <Link href="/manage/events" className="manage-back-link">← Back to My Events</Link>
      <h1 className="manage-page-title">Create Event</h1>
      <EventForm mode="create" />
    </div>
  );
}
