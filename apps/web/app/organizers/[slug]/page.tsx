import { OrganizerDetailClient } from "../../../components/OrganizerDetailClient";

export default function OrganizerDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  return <OrganizerDetailClient slug={params.slug} />;
}
