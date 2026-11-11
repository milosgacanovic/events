import type { Metadata } from "next";

import { EntityNotFound } from "../../../components/EntityNotFound";

export const metadata: Metadata = { title: "Host not found | DanceResource" }; // Next adds robots noindex to 404s itself

// Real 404 for a missing host (the page calls notFound()).
export default function HostNotFound() {
  return <EntityNotFound kind="host" />;
}
