import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import { Avatar } from "@/components/avatar";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card, LinkButton, PageSkeleton } from "@/components/ui";
import { getOrganizationBySlug, type OrganizationDetail } from "@/features/organizations/queries";
import { viewerCan } from "@/lib/services/server";

export async function generateMetadata({
	params,
}: PageProps<"/organizations/[slug]">): Promise<Metadata> {
	const org = await getOrganizationBySlug((await params).slug);
	return { title: org?.name ?? "League" };
}

export default function OrganizationPage({ params }: PageProps<"/organizations/[slug]">) {
	return (
		<Suspense fallback={<PageSkeleton />}>
			<Organization params={params} />
		</Suspense>
	);
}

async function Organization({ params }: { params: PageProps<"/organizations/[slug]">["params"] }) {
	const org = await getOrganizationBySlug((await params).slug);
	if (org === null) notFound();
	return (
		<>
			<div className="mb-6 flex flex-wrap items-end justify-between gap-3">
				<div className="flex items-center gap-4">
					<Avatar src={org.logoUrl} name={org.name} size={72} shape="square" />
					<div>
						<p className="text-sm font-semibold uppercase tracking-wide text-muted">League</p>
						<h1 className="font-display text-4xl font-bold uppercase tracking-wide sm:text-5xl">
							{org.name}
						</h1>
					</div>
				</div>
				<Suspense fallback={null}>
					<Controls org={org} />
				</Suspense>
			</div>
			<Card className="p-5 text-muted">
				Seasons, tournaments, fixtures and the league website arrive in later phases.
			</Card>
		</>
	);
}

async function Controls({ org }: { org: OrganizationDetail }) {
	if (!(await viewerCan("organization.update", { type: "organization", id: org.id }))) return null;
	return (
		<LinkButton href={`/organizations/${org.slug}/edit`} variant="ghost">
			<Pencil className="size-4" aria-hidden="true" /> Edit
		</LinkButton>
	);
}
