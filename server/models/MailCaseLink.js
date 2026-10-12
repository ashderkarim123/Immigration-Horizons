const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

/**
 * A link between one message in the shared Outlook mailbox and one case (ADR-030). It is the ONLY mail data this
 * application stores: the message itself stays in Microsoft's mailbox and is fetched on demand.
 *
 * The subject, sender and date are a display snapshot taken when the link is made, so a case can list its emails
 * without a Microsoft call per row. No body, recipient list or attachment is ever copied.
 */
const MailCaseLinkSchema = new mongoose.Schema(
  {
    messageId: { type: String, required: true, maxlength: 512 }, // Graph immutable id
    case: { type: ObjectId, ref: 'ClientCase', required: true },
    workspace: { type: ObjectId, ref: 'CaseWorkspace', required: true },
    subject: { type: String, default: '', maxlength: 300 },
    fromName: { type: String, default: '', maxlength: 200 },
    fromAddress: { type: String, default: '', maxlength: 254 },
    messageDate: { type: Date, default: null },
    linkedBy: { type: ObjectId, ref: 'AdminUser', required: true },
    linkedByName: { type: String, default: '', maxlength: 120 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

MailCaseLinkSchema.index({ messageId: 1, case: 1 }, { unique: true });
MailCaseLinkSchema.index({ case: 1, messageDate: -1 });

module.exports = mongoose.model('MailCaseLink', MailCaseLinkSchema, 'mail_case_links');
