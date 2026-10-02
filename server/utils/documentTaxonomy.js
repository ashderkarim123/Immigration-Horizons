// Server-owned upload types. Existing category template keys stay stable.
const DOCUMENT_TYPES_BY_CATEGORY = {
  identity_civil_documents: ['Passport', 'National identity card', 'Birth certificate', 'Marriage certificate'],
  immigration_history: ['Visa', 'I-94 record', 'Status document', 'USCIS correspondence'],
  education_academic_records: ['Degree certificate', 'Transcript', 'Credential evaluation'],
  employment_professional_experience: ['Resume', 'Employment letter', 'Experience letter', 'Contract'],
  recommendation_letters: ['Recommendation letter', 'Recommender background'],
  publications_citations_judging_media: ['Publication', 'Citation report', 'Research evidence', 'Judging evidence', 'Media coverage'],
  awards_memberships_recognition: ['Award', 'Membership', 'Recognition evidence'],
  uscis_receipts_notices: ['Receipt notice', 'Government correspondence'],
  personal_civil_records: ['Birth certificate', 'Marriage certificate', 'Divorce record', 'Civil record'],
  business_financial_records: ['Business registration', 'Financial statement', 'Tax record', 'Business evidence'],
  other: ['Other supporting document'],
};
function documentTypesForCategory(templateKey) {
  return [...(DOCUMENT_TYPES_BY_CATEGORY[templateKey] || []), 'Other'];
}
module.exports = { DOCUMENT_TYPES_BY_CATEGORY, documentTypesForCategory };
