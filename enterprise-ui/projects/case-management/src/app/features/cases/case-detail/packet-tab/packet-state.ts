import { PacketKind, PacketRole, PacketStatus } from '../../../../core/api/filing-packet.types';

/** Display vocabulary and the printable manifest for the Packet tab. A packet is a manifest, never "the filing PDF". */

export const PACKET_STATUS_LABELS: Record<PacketStatus, string> = {
  draft: 'Draft',
  review: 'In review',
  needs_changes: 'Changes requested',
  approved: 'Approved',
  finalized: 'Finalized',
  archived: 'Archived',
};

/** `variant` of the shared status badge - explicit so `archived`-style words never auto-colour as danger. */
export const PACKET_STATUS_VARIANTS: Record<PacketStatus, 'neutral' | 'purple' | 'warning' | 'success' | 'info'> = {
  draft: 'neutral',
  review: 'purple',
  needs_changes: 'warning',
  approved: 'success',
  finalized: 'info',
  archived: 'neutral',
};

export const PACKET_ROLES: { value: PacketRole; label: string }[] = [
  { value: 'cover_sheet', label: 'Cover sheet' },
  { value: 'petition_letter', label: 'Petition letter' },
  { value: 'uscis_form', label: 'USCIS form' },
  { value: 'supporting_evidence', label: 'Supporting evidence' },
  { value: 'recommendation_letter', label: 'Recommendation letter' },
  { value: 'expert_opinion_letter', label: 'Expert opinion letter' },
  { value: 'business_plan', label: 'Business plan' },
  { value: 'identity_civil', label: 'Identity / civil documents' },
  { value: 'immigration_history', label: 'Immigration history' },
  { value: 'exhibit', label: 'Exhibit' },
  { value: 'other', label: 'Other' },
];

export const roleLabel = (role: string): string => PACKET_ROLES.find((r) => r.value === role)?.label ?? role;
export const kindLabel = (kind: PacketKind | string): string => kind.replace(/_/g, ' ');

export const formatSize = (bytes: number | null | undefined): string => {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Every value that reaches the print window goes through this - filenames and notes are user content. */
export const escapeHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

export interface ManifestRow {
  order: number;
  label: string;
  role: string;
  required: boolean;
  source: string;
  status: string;
}

export interface ManifestInput {
  heading: string;
  packetTitle: string;
  statusLine: string;
  petitionLine: string;
  rows: ManifestRow[];
  finalizedLine: string | null;
  manifestHash: string | null;
}

/** A standalone, escaped HTML document for `window.print()`. Titled a manifest on purpose. */
export function buildManifestHtml(m: ManifestInput): string {
  const rows = m.rows
    .map(
      (r) =>
        `<tr><td>${r.order}</td><td>${escapeHtml(r.label)}</td><td>${escapeHtml(roleLabel(r.role))}</td><td>${r.required ? 'Required' : 'Optional'}</td><td>${escapeHtml(r.source)}</td><td>${escapeHtml(r.status)}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(m.packetTitle)} — filing manifest</title>
<style>body{font:14px/1.45 system-ui,sans-serif;margin:2rem;color:#111}h1{font-size:1.3rem;margin:0 0 .25rem}p{margin:.2rem 0}table{border-collapse:collapse;width:100%;margin-top:1rem}th,td{border:1px solid #999;padding:.35rem .5rem;text-align:left;vertical-align:top}th{background:#f1f1f1}.hash{font:12px ui-monospace,monospace;word-break:break-all}.note{color:#555;font-size:12px;margin-top:1rem}</style></head><body>
<h1>${escapeHtml(m.heading)}</h1>
<p><strong>${escapeHtml(m.packetTitle)}</strong></p>
<p>${escapeHtml(m.statusLine)}</p>
<p>${escapeHtml(m.petitionLine)}</p>
<table><thead><tr><th>#</th><th>Item</th><th>Role</th><th>Required</th><th>Source version</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
${m.finalizedLine ? `<p>${escapeHtml(m.finalizedLine)}</p>` : ''}
${m.manifestHash ? `<p>Manifest hash (sha256): <span class="hash">${escapeHtml(m.manifestHash)}</span></p>` : ''}
<p class="note">This is a human-readable manifest of the exact sources assembled. It is not a combined filing document, a signature or a statement about the strength of the case.</p>
</body></html>`;
}
