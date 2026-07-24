/**
 * Privacy and Terms content.
 *
 * Plain, honest, and specific to how this practice actually operates — a lead
 * form, email/WhatsApp contact, marketplace profiles, and analytics. It is
 * written to be accurate about data handling, not to imitate a law firm's
 * boilerplate. The last-updated date is a real constant, surfaced on-page.
 */

export const legalUpdated = "July 2026";

export type LegalBlock = { heading: string; paragraphs: string[] };

export const privacyContent: LegalBlock[] = [
  {
    heading: "Who we are",
    paragraphs: [
      "Immigration Horizons is an immigration consulting and paralegal services practice. This policy explains what information we collect when you use this website or contact us, how we use it, and the choices you have. We are not a law firm and this policy is not legal advice.",
    ],
  },
  {
    heading: "Information we collect",
    paragraphs: [
      "When you submit the consultation or contact form, we collect the information you choose to provide — typically your name, email address, phone number, the service you are interested in, and the description of your situation.",
      "When you visit the site, our analytics tools collect standard technical and usage information such as pages viewed, approximate location, device and browser type, and how you arrived at the site (including marketing campaign parameters where present). This is used in aggregate to understand and improve the site.",
    ],
  },
  {
    heading: "How we use your information",
    paragraphs: [
      "We use the information you submit to respond to your enquiry, assess your situation, and communicate with you about the services you asked about — by email or WhatsApp. We use analytics data to understand how the site is used and to improve it.",
      "We do not sell your personal information, and we do not share it with third parties except the service providers that help us operate — for example, our email delivery provider — and only to the extent needed to provide the service.",
    ],
  },
  {
    heading: "Marketing parameters and cookies",
    paragraphs: [
      "If you arrive via an advertisement or campaign link, the campaign parameters in that link (such as UTM tags or click identifiers) may be captured with your form submission so we understand how you found us. Our analytics providers may set cookies or similar technologies. You can control cookies through your browser settings.",
    ],
  },
  {
    heading: "How long we keep it",
    paragraphs: [
      "We keep enquiry information for as long as needed to respond to and follow up on your request, and to keep records of our communications. You can ask us to delete your information at any time using the contact details below.",
    ],
  },
  {
    heading: "Your choices",
    paragraphs: [
      "You can ask us what information we hold about you, ask us to correct it, or ask us to delete it. You can also ask us to stop contacting you at any time. To make any of these requests, email us using the address on our contact page.",
    ],
  },
  {
    heading: "Third-party links",
    paragraphs: [
      "This site links to external resources, including official government pages and our marketplace profiles. We are not responsible for the privacy practices or content of websites we do not operate.",
    ],
  },
  {
    heading: "Changes to this policy",
    paragraphs: [
      "We may update this policy from time to time. The date at the top of the page shows when it was last revised. Continued use of the site after a change means you accept the updated policy.",
    ],
  },
];

export const termsContent: LegalBlock[] = [
  {
    heading: "About these terms",
    paragraphs: [
      "These terms govern your use of the Immigration Horizons website and the consultation and contact forms. By using the site, you agree to them. If you do not agree, please do not use the site.",
    ],
  },
  {
    heading: "We are not a law firm",
    paragraphs: [
      "Immigration Horizons provides immigration consulting and paralegal services — petition preparation, drafting, research, evidence organisation, and document support. We are not attorneys, we do not provide legal advice, and we do not represent clients before USCIS or any court. Nothing on this site creates an attorney-client relationship, and nothing on it is legal advice.",
      "Where a matter requires legal representation or legal advice, you should consult a licensed immigration attorney.",
    ],
  },
  {
    heading: "Educational information only",
    paragraphs: [
      "The content on this site, including the service and guide pages, is general educational information about U.S. immigration categories and processes. Immigration law and USCIS practice change, and every case turns on its own facts. The information here is not a substitute for advice about your individual situation, and you should not act on it without assessing how it applies to you.",
    ],
  },
  {
    heading: "No guarantee of outcomes",
    paragraphs: [
      "USCIS adjudicates every petition on its own record, and no preparer controls that outcome. We do not guarantee that any petition, application, or response will be approved. Any statements about our experience or past results describe work we have done and do not promise a particular result in your case.",
    ],
  },
  {
    heading: "Your responsibilities",
    paragraphs: [
      "You are responsible for the accuracy and completeness of the information and documents you provide. Providing false or misleading information to USCIS carries serious consequences, and we do not prepare documents that misrepresent facts or overstate a record.",
    ],
  },
  {
    heading: "Engagement and scope",
    paragraphs: [
      "Submitting a form on this site is an enquiry, not an engagement. Any working relationship, its scope, and its terms are set out separately when you decide to engage us for specific work. Nothing on this site obliges either of us to enter into that relationship.",
    ],
  },
  {
    heading: "Intellectual property",
    paragraphs: [
      "The content, design, and materials on this site belong to Immigration Horizons unless otherwise stated, and may not be copied or reused without permission.",
    ],
  },
  {
    heading: "Limitation of liability",
    paragraphs: [
      "The site is provided on an as-is basis. To the extent permitted by law, we are not liable for any loss arising from reliance on the general information provided here. Advice and work product provided under a specific engagement are governed by the terms of that engagement.",
    ],
  },
  {
    heading: "Changes to these terms",
    paragraphs: [
      "We may update these terms from time to time. The date at the top of the page shows when they were last revised. Continued use of the site after a change means you accept the updated terms.",
    ],
  },
];
