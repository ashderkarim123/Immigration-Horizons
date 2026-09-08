const mongoose = require('mongoose');

const REQUIREMENT_STATUSES = ['missing', 'in_progress', 'satisfied', 'waived', 'not_applicable'];
const REQUIREMENT_IMPORTANCE = ['required', 'recommended', 'optional'];

const EvidenceRequirementSchema = new mongoose.Schema(
  {
    case: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCase', required: true, index: true },
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'CaseWorkspace', required: true, index: true },
    source: { type: String, enum: ['template', 'custom'], required: true },
    
    // Provenance (if from template)
    templateKey: { type: String, default: null },
    templateVersion: { type: Number, default: null },
    templateItemKey: { type: String, default: null },
    
    section: { type: String, default: 'General' },
    order: { type: Number, default: 0 },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    importance: { type: String, enum: REQUIREMENT_IMPORTANCE, default: 'required' },
    status: { type: String, enum: REQUIREMENT_STATUSES, default: 'missing' },
    
    clientVisible: { type: Boolean, default: false },
    clientGuidance: { type: String, default: '' },
    staffGuidance: { type: String, default: '' },
    internalNotes: { type: String, default: '' },
    
    linkedCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DocumentCategory' }],
    linkedDocuments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CaseDocument' }],
    linkedRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DocumentRequest' }],
    
    waivedReason: { type: String, default: null },
    notApplicableReason: { type: String, default: null },
    
    satisfiedAt: { type: Date, default: null },
    satisfiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true },
  },
  { timestamps: true }
);

// We need to support uniqueness of template items per case to ensure idempotent provisioning
// But we must allow multiple custom requirements, so we use a partial index.
EvidenceRequirementSchema.index(
  { case: 1, templateKey: 1, templateVersion: 1, templateItemKey: 1 },
  { 
    unique: true, 
    partialFilterExpression: { 
      templateKey: { $type: "string" },
      templateVersion: { $type: "int" },
      templateItemKey: { $type: "string" }
    } 
  }
);

EvidenceRequirementSchema.index({ case: 1, section: 1, order: 1 });
EvidenceRequirementSchema.index({ case: 1, status: 1, importance: 1 });

EvidenceRequirementSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    if (this.status !== 'waived') this.waivedReason = null;
    if (this.status !== 'not_applicable') this.notApplicableReason = null;
    if (this.status !== 'satisfied') {
      this.satisfiedAt = null;
      this.satisfiedBy = null;
    }
  }
  next();
});

EvidenceRequirementSchema.statics.STATUSES = REQUIREMENT_STATUSES;
EvidenceRequirementSchema.statics.IMPORTANCE = REQUIREMENT_IMPORTANCE;

module.exports = mongoose.model('EvidenceRequirement', EvidenceRequirementSchema);
