import type { Metadata } from "next";

import { EntityNotFound } from "../../../components/EntityNotFound";

export const metadata: Metadata = { title: "Event not found | DanceResource" }; // Next adds robots noindex to 404s itself

// Real 404 for a missing event (the page calls notFound()).
export default function EventNotFound() {
  return <EntityNotFound kind="event" />;
}
