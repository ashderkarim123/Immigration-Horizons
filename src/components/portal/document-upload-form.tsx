"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { postPortalFormData } from "@/lib/auth/portal-fetch";

/**
 * Shared upload form for a new document (categoryId), a request
 * fulfillment (requestId), or a replacement (replaceDocumentId) — exactly
 * one of the three target props is expected per instance.
 */
export function DocumentUploadForm({
  caseId,
  categoryId,
  requestId,
  replaceDocumentId,
  label = "Upload",
}: {
  caseId: string;
  categoryId?: string;
  requestId?: string;
  replaceDocumentId?: string;
  label?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    if (categoryId) formData.set("categoryId", categoryId);
    if (replaceDocumentId) formData.set("replaceDocumentId", replaceDocumentId);

    const path = requestId
      ? `/api/portal/document-requests/${requestId}/upload`
      : `/api/portal/cases/${caseId}/documents`;

    const result = await postPortalFormData(path, formData);

    if (!result.ok) {
      setPending(false);
      setError(result.error.message);
      return;
    }

    formRef.current?.reset();
    setPending(false);
    router.push(result.redirectTo ?? `/portal/cases/${caseId}/documents`);
    router.refresh();
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-wrap items-center gap-3" noValidate>
      {error ? (
        <p className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <input
        type="file"
        name="file"
        required
        accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,.tif,.tiff"
        className="text-ink-600 text-sm"
      />
      <Button type="submit" variant="gold" size="sm" disabled={pending}>
        {pending ? "Uploading…" : label}
      </Button>
    </form>
  );
}
