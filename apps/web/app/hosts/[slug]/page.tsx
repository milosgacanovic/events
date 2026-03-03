import { OrganizerDetailClient } from "../../../components/OrganizerDetailClient";

export default function HostDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  return <OrganizerDetailClient slug={params.slug} />;
}
