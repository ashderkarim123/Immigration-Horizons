// Generated from server/utils/documentTaxonomy.js.
export const DOCUMENT_TYPES_BY_CATEGORY: Record<string, string[]> = {
  "identity_civil_documents": [
    "Passport",
    "Visa",
    "I-94",
    "EAD",
    "Green Card",
    "National identity card"
  ],
  "immigration_history": [
    "Visa",
    "I-94",
    "EAD",
    "Green Card",
    "Status document",
    "USCIS correspondence"
  ],
  "education_academic_records": [
    "Degree certificate",
    "Transcript",
    "Credential evaluation",
    "Professional certificate"
  ],
  "employment_professional_experience": [
    "CV / Resume",
    "Employment verification",
    "Experience letter",
    "Offer letter",
    "Contract"
  ],
  "recommendation_letters": [
    "Recommendation letter",
    "Recommender background"
  ],
  "publications_citations_judging_media": [
    "Publication",
    "Citation report",
    "Research evidence",
    "Judging evidence",
    "Media coverage"
  ],
  "awards_memberships_recognition": [
    "Award",
    "Membership",
    "Recognition evidence"
  ],
  "uscis_receipts_notices": [
    "I-797",
    "Receipt notice",
    "RFE",
    "NOID",
    "Government correspondence"
  ],
  "personal_civil_records": [
    "Birth certificate",
    "Marriage certificate",
    "Divorce record",
    "Civil record"
  ],
  "business_financial_records": [
    "Business registration",
    "Financial statement",
    "Tax return",
    "Business evidence"
  ],
  "other": [
    "Other supporting document"
  ]
};
export function documentTypesForCategory(templateKey: string) { return [...(DOCUMENT_TYPES_BY_CATEGORY[templateKey] || []), 'Other']; }
