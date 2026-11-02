import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { OrganizationForm } from "@/features/organizations/organization-form";
import { getOrganizationBySlug } from "@/features/organizations/queries";
import { NotAllowed } from "@/features/shared/not-allowed";
import { requireUser } from "@/lib/auth/session";
import { viewerCan } from "@/lib/services/server";

export const metadata: Metadata = { title: "Edit league" };

export default function EditOrganizationPage({ params }: PageProps<"/organizations/[slug]/edit">) {
	return (
		<div className="mx-auto max-w-xl">
			<PageHeader title="Edit league" />
			<Suspense fallback={<PageSkeleton />}>
				<Edit params={params} />
			</Suspense>
		</div>
	);
}

async function Edit({ params }: { params: PageProps<"/organizations/[slug]/edit">["params"] }) {
	const { slug } = await params;
	await requireUser(`/organizations/${slug}/edit`);
	const org = await getOrganizationBySlug(slug);
	if (org === null) notFound();
	if (!(await viewerCan("organization.update", { type: "organization", id: org.id }))) {
		return (
			<NotAllowed backHref={`/organizations/${org.slug}`}>
				Only the league&apos;s admins can edit it.
			</NotAllowed>
		);
	}
	return <OrganizationForm organization={org} />;
}
