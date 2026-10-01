import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Container } from "@/components/ui/container";
import { PageHeader } from "@/components/app/page-header";
import { SmartFormEditor } from "@/components/portal/smart-form-editor";
import { requireClient } from "@/lib/auth/current-client";
import { getAccessibleCase } from "@/lib/auth/case-policy";
import { getAccessibleForm } from "@/lib/auth/form-policy";
import { toClientDto } from "@/lib/forms/form-service";

export const metadata: Metadata = {
  title: "Case Form",
  robots: { index: false, follow: false },
};

export default async function PortalCaseFormPage({ params }: { params: Promise<{ caseId: string; formId: string }> }) {
  const { caseId, formId } = await params;
  const client = await requireClient(`/portal/cases/${caseId}/forms/${formId}`);

  const accessible = await getAccessibleCase(caseId, String(client._id));
  const loaded = accessible ? await getAccessibleForm(formId, String(client._id)) : null;
  // The form must belong to the case in the URL, so a valid id can't be browsed under another case.
  if (!accessible || !loaded || String(loaded.form.case) !== String(accessible.caseDoc._id)) notFound();

  const dto = toClientDto(loaded.form, loaded.template);

  const trail = [
    { name: "Portal", href: "/portal" },
    { name: "Cases", href: "/portal/cases" },
    { name: accessible.caseDoc.caseNumber, href: `/portal/cases/${caseId}` },
    { name: "Forms", href: `/portal/cases/${caseId}/forms` },
    { name: dto.title, href: `/portal/cases/${caseId}/forms/${formId}` },
  ];

  return (
    <Container width="default" className="py-10 sm:py-14">
      <PageHeader title={dto.title} breadcrumbs={trail} />
      <div className="mt-8">
        <SmartFormEditor initial={dto} />
      </div>
    </Container>
  );
}
