const mongoose = require('mongoose');

const ConsultationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    service: {
      type: String,
      enum: [
        'EB-2 NIW', 'EB-1A', 'EB-1B', 'EB-1C', 'O-1 Visa',
        'RFE & NOID Responses', 'Recommendation Letters', 'Expert Opinion Letters',
        'Business & Personal Plans', 'Evidence Review & Packaging',
        'Immigration Consultation', 'Not Sure / Need Guidance',
      ],
      default: 'Not Sure / Need Guidance',
    },
    message: { type: String, required: true },
    // Added for the CMS leads view. Optional and back-compatible; existing
    // records simply have empty values until the forms start capturing them.
    country: { type: String, default: '', trim: true },
    occupation: { type: String, default: '', trim: true },
    attachmentUrl: { type: String, default: '' },
    // NOTE: `source` means "which form was submitted" (consultation vs
    // contact page) and is read by the mailer in the root app — do not
    // repurpose it. Marketing-channel tracking lives in `leadSource` below.
    source: { type: String, enum: ['consultation', 'contact'], default: 'consultation' },

    // ---- Lead-operations fields (Phase 9). All additive/optional so
    // existing documents and the root/Next.js apps' own schema copies are
    // completely unaffected. ----
    leadSource: {
      type: String,
      enum: ['Website Form', 'Facebook', 'Instagram', 'Manual Entry', 'Email', 'Referral', 'WhatsApp', 'Other'],
      default: 'Website Form',
    },
    campaign: { type: String, default: '' },

    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    ownerName: { type: String, default: '' },
    assignees: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
        name: { type: String, required: true },
        taskType: { type: String, default: '' },
      },
    ],

    priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },

    deliveryStatus: {
      type: String,
      enum: ['drafting', 'internal_review', 'client_review', 'ready', 'delivered'],
      default: 'drafting',
    },
    utmSource: { type: String, default: '' },
    utmMedium: { type: String, default: '' },
    utmCampaign: { type: String, default: '' },
    utmTerm: { type: String, default: '' },
    utmContent: { type: String, default: '' },
    gclid: { type: String, default: '' },
    fbclid: { type: String, default: '' },
    landingPage: { type: String, default: '' },
    referrer: { type: String, default: '' },
    emailSent: { type: Boolean, default: false },
    // Superset of the original 5-value enum — every prior status string
    // remains valid so no existing document is invalidated. The 12-stage
    // petition-operations lifecycle (Phase 9) reuses 'new'/'contacted'/
    // 'in_progress'/'closed' where they already mean the same thing, and
    // adds the 8 stages that didn't previously exist. See STATUS_STAGES
    // below for the canonical display order.
    status: {
      type: String,
      enum: [
        // Original values (kept for back-compat with existing records)
        'new', 'contacted', 'consultation_scheduled', 'in_progress', 'closed',
        // New stages introduced by the 12-stage lifecycle
        'qualified', 'assigned', 'tasks_created',
        'waiting_on_client', 'internal_review', 'ready_for_filing', 'submitted', 'delivered',
      ],
      default: 'new',
    },

    // ---- Case conversion (Cycle 2). Additive/optional — existing
    // consultations and public form submissions remain valid without these
    // fields ever being set. A boolean `converted` flag was deliberately
    // not used: `convertedCase` IS the authoritative "is this converted"
    // signal (non-null = converted) and also lets every caller jump
    // straight to the case without a second lookup. ----
    convertedCase: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCase', default: null },
    convertedAt: { type: Date, default: null },

    // `clientUser` was added to the Next.js app's copy of this schema in
    // Cycle 1 (see docs/architecture/ADR-001) but never mirrored here,
    // since this app never needed to read it — Cycle 2's case-conversion
    // service does (it's how a case's primary client is resolved from a
    // consultation), so it's added here now too. Same field name, same
    // meaning, same optional/nullable shape — this app still never *sets*
    // it, only reads it (Next.js's own activation/login flow is the only
    // writer).
    clientUser: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientUser', default: null },
  },
  { timestamps: true }
);

/**
 * Canonical 12-stage lifecycle, in order, for the status dropdown and any
 * progress indicator. `consultation_scheduled` is intentionally excluded —
 * it's a legacy value kept valid for old records, not part of the active flow.
 */
ConsultationSchema.statics.STATUS_STAGES = [
  { value: 'new', label: 'New Lead' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'assigned', label: 'Assigned to Team' },
  { value: 'tasks_created', label: 'Petition Tasks Created' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'waiting_on_client', label: 'Waiting on Client' },
  { value: 'internal_review', label: 'Internal Review' },
  { value: 'ready_for_filing', label: 'Ready for Filing' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'closed', label: 'Closed' },
];

/**
 * Indexes matched to the actual query patterns in routes/admin/index.js and
 * routes/admin/leadOps.js — see server/scripts/createIndexes.js for how
 * these get created in production (not automatically on startup).
 *
 * The /admin/leads list and CSV export apply an ad-hoc combination of
 * optional equality filters (status, service, leadSource, priority, owner/
 * assignee) plus a 4-field regex OR-search, always sorted newest-first.
 * MongoDB only uses one index per query, so rather than one index per
 * filterable field (which mostly just adds write overhead without helping
 * any single query), these cover the filters that are either the sole
 * filter in the common case (status) or otherwise expensive to scan for
 * (owner/assignee lookups, exact email lookups):
 */
ConsultationSchema.index({ status: 1, createdAt: -1 }); // status filter + default sort; also serves the notification-bell "new leads" count and dashboard status counts
ConsultationSchema.index({ createdAt: -1 }); // unfiltered list/export default sort, and date-range filtering
ConsultationSchema.index({ email: 1 }); // exact-match lookups / de-dup checks
ConsultationSchema.index({ owner: 1 }); // owner filter, and the "unassigned" (owner: null) filter
ConsultationSchema.index({ 'assignees.user': 1 }); // assignee filter (multikey on the assignees subdocument array)
ConsultationSchema.index({ service: 1 }); // service filter + the leads-list service-count aggregation
// leadSource and priority are filterable but lower-cardinality and not yet
// observed as a primary filter in practice — deliberately left unindexed to
// avoid write-side index bloat; add them if usage shows otherwise.

module.exports = mongoose.model('Consultation', ConsultationSchema);