import { redirect } from "next/navigation";

export default function OrganizerDetailRedirectPage({
  params,
}: {
  params: { slug: string };
}) {
  redirect(`/hosts/${params.slug}`);
}
