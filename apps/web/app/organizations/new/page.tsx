import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { OrganizationForm } from "@/features/organizations/organization-form";

export const metadata: Metadata = { title: "New league" };

export default function NewOrganizationPage() {
	return (
		<div className="mx-auto max-w-xl">
			<PageHeader
				title="New league"
				subtitle="Run seasons, tournaments and a league website. You'll be its admin."
			/>
			<OrganizationForm />
		</div>
	);
}
