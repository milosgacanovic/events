import { EventDetailClient } from "../../../components/EventDetailClient";

export default function EventDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  return <EventDetailClient slug={params.slug} />;
}
