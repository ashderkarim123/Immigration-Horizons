"use client";

import { useRef, useState, useId, type FormEvent } from "react";
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
  categories,
  subjectLabel = "You",
  maxFileBytes = 25 * 1024 * 1024,
  label = "Upload",
}: {
  caseId: string;
  categoryId?: string;
  requestId?: string;
  replaceDocumentId?: string;
  categories?: { id: string; name: string; documentTypes: string[] }[];
  subjectLabel?: string;
  maxFileBytes?: number;
  label?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [selectedCategory, setSelectedCategory] = useState(categoryId || "");
  const general = !requestId && !replaceDocumentId;
  const category = categories?.find(item => item.id === selectedCategory);
  const chooseFile = (candidate: File | undefined) => {
    if (!candidate) return false;
    setFile(null);
    if (!/\.(pdf|docx|xlsx|jpe?g|png|tiff?)$/i.test(candidate.name)) { setError("Choose a PDF, Word, Excel, or image file."); return false; }
    if (candidate.size > maxFileBytes) { setError(`Choose a file smaller than ${Math.ceil(maxFileBytes / 1024 / 1024)} MB.`); return false; }
    setError(null); setFile(candidate);
    return true;
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    // A native picker can receive a selection before hydration completes.
    // Retain that selection and apply the same validation used for drag/drop.
    const selectedFile = file || event.currentTarget.querySelector<HTMLInputElement>('input[type="file"]')?.files?.[0];
    if (!selectedFile) { setError("Choose a file to upload."); return; }
    if (!chooseFile(selectedFile)) return;
    setPending(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    formData.set("file", selectedFile);
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
    setFile(null);
    setPending(false);
    router.push(result.redirectTo ?? `/portal/cases/${caseId}/documents`);
    router.refresh();
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-3" aria-busy={pending}>
      {error ? (
        <p className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {general ? <label className="text-sm font-medium">Document subject
        <select name="subject" className="mt-1 block w-full rounded-lg border border-ink-200 p-2" disabled={pending}><option value="self">{subjectLabel}</option></select>
      </label> : null}
      {categories ? <>
        <div><label htmlFor={`${fileId}-category`} className="text-sm font-medium">Category</label><select id={`${fileId}-category`} name="categoryId" value={selectedCategory} onChange={event => setSelectedCategory(event.target.value)} required disabled={pending} className="mt-1 block w-full rounded-lg border border-ink-200 p-2"><option value="">Choose a category</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        <div><label htmlFor={`${fileId}-type`} className="text-sm font-medium">Document type</label><select id={`${fileId}-type`} key={selectedCategory} name="documentType" required disabled={pending || !category} className="mt-1 block w-full rounded-lg border border-ink-200 p-2"><option value="">Choose a document type</option>{category?.documentTypes.map(type => <option key={type} value={type}>{type}</option>)}</select></div>
      </> : null}
      {general ? <>
        <label className="text-sm font-medium">Document title<input name="title" required maxLength={255} disabled={pending} placeholder="For example, current passport" className="mt-1 block w-full rounded-lg border border-ink-200 p-2" /></label>
      </> : null}
      <label className="text-sm font-medium">Description (optional)<textarea name="description" maxLength={2000} disabled={pending} className="mt-1 block w-full rounded-lg border border-ink-200 p-2" /></label>
      <div onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!pending) chooseFile(event.dataTransfer.files[0]); }} className="rounded-lg border-2 border-dashed border-ink-200 p-4">
      <label htmlFor={fileId} className="mb-2 block text-sm font-medium">Drag a file here, or choose a file</label>
      <input
        id={fileId}
        type="file"
        name="file"
        disabled={pending}
        onChange={event => chooseFile(event.target.files?.[0])}
        accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,.tif,.tiff"
        className="text-ink-600 text-sm"
      />
      <p className="mt-2 text-xs text-ink-500" role="status">{file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : `PDF, Word, Excel, or image. Maximum ${Math.ceil(maxFileBytes / 1024 / 1024)} MB.`}</p>
      </div>
      <Button type="submit" variant="gold" size="sm" disabled={pending}>
        {pending ? "Uploading…" : label}
      </Button>
    </form>
  );
}
