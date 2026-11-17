import { otherVisas } from "./services";
import { social } from "./site";

export type ReviewPlatform = "Fiverr" | "Upwork" | "Direct";

/**
 * Client testimonials sourced from the Fiverr gig reviews and inbox. Every
 * entry links back to the public profile so a visitor can verify it — that
 * verifiability is the point, so `verifyUrl` is required, not optional.
 * `text` is verbatim: trim only, never edit wording.
 */
export type Testimonial = {
  id: string;
  /** As shown publicly on the platform (username or first name); never invented. */
  name: string;
  location: string;
  /** Display label, e.g. "EB-2 NIW". */
  service: string;
  /** Slug from `allServices`; set only when the review makes the service unambiguous. */
  serviceSlug?: string;
  /** 1–5, exactly as on the platform. */
  rating: number;
  date: string;
  text: string;
  source: ReviewPlatform;
  verifyUrl: string;
  /** Homepage selection. */
  featured?: boolean;
};

export const testimonials: Testimonial[] = [
  {
    id: "juliet-mirambo",
    name: "Juliet Mirambo",
    location: "United States",
    service: "EB-1A",
    serviceSlug: "eb1a",
    featured: true,
    rating: 5,
    date: "Fiverr review",
    text: "Rahat is polite and communicative, delivered in a timely manner, helped arrange and index huge amounts of exhibits for EB1A.",
    source: "Fiverr",
    verifyUrl: social.fiverrProfile,
  },
  {
    id: "camilojim-1",
    name: "camilojim",
    location: "United States · Repeat Client",
    service: "EB-1A",
    serviceSlug: "eb1a",
    featured: true,
    rating: 5,
    date: "Fiverr review",
    text: "Excellent experience working with this freelancer. Communication was clear, proactive, and professional from start to finish. Strong attention to detail, accurate interpretation of information, and the final result delivered exactly as needed — responsive, reliable, and went above expectations.",
    source: "Fiverr",
    verifyUrl: social.fiverrProfile,
  },
  {
    id: "camilojim-2",
    name: "camilojim",
    location: "United States · Repeat Client",
    service: "EB-1A",
    serviceSlug: "eb1a",
    featured: true,
    rating: 5,
    date: "Fiverr review",
    text: "An outstanding experience — exceptional professionalism, attention to detail, and a strong commitment to high-quality results. Communication was clear, timely, and proactive throughout, and the work consistently exceeded expectations. Highly recommended for anyone looking for reliable, skilled, results-driven support.",
    source: "Fiverr",
    verifyUrl: social.fiverrProfile,
  },
  {
    id: "niw-rfe-approval-2024",
    name: "Verified Fiverr Client",
    location: "EB2-NIW Case",
    service: "EB-2 NIW",
    serviceSlug: "eb2-niw",
    rating: 5,
    date: "Jul 2024 – Nov 2024",
    text: "I want to share my exceptional experience working with Rahat, who provided invaluable assistance in preparing a response to an RFE from USCIS for my EB2-NIW case. His careful attention to detail and thorough approach were evident throughout. The results speak for themselves — thanks to his expertise and dedication, USCIS approved my EB2-NIW case.",
    source: "Fiverr",
    verifyUrl: social.fiverrProfile,
  },
  {
    id: "niw-rfe-approval-2025",
    name: "Verified Fiverr Client",
    location: "NIW RFE Response",
    service: "EB-2 NIW",
    serviceSlug: "eb2-niw",
    rating: 5,
    date: "Mar 2025 – Jun 2025",
    text: "I'm thrilled to share that my EB2 NIW was approved — and I owe a great deal of that success to Rahat. My original petition received an RFE because my law firm didn't provide much support. Rahat stepped in and made a real difference; the RFE reply he crafted was outstanding. I highly recommend hiring him with confidence.",
    source: "Fiverr",
    verifyUrl: social.fiverrProfile,
  },
  {
    id: "sohail-ansari",
    name: "Sohail Ansari",
    location: "Direct client message",
    service: "I-140 Petition",
    rating: 5,
    date: "Fiverr inbox",
    text: "Just an update that Dr. Maria’s petition has been approved. Thanks for all your help.",
    source: "Fiverr",
    verifyUrl: social.fiverrProfile,
  },
  {
    id: "henry-lindpere",
    name: "Henry Lindpere",
    location: "Lindpere Legal — Contract Paralegal",
    service: "RFE Response",
    serviceSlug: "rfe-response",
    rating: 5,
    date: "Fiverr inbox",
    text: 'No problem, Rahat! The other attorney I sent the case to (after very minor edits) called it a "work of genius." Looking forward to working with you again soon.',
    source: "Fiverr",
    verifyUrl: social.fiverrProfile,
  },
  {
    id: "ashwin-sankaran",
    name: "Ashwin Sankaran",
    location: "Direct client message",
    service: "I-140 Petition",
    rating: 5,
    date: "Fiverr inbox",
    text: "Hi Rahat - I have my I-140 approved today and thanks to all your efforts. I truly appreciate all the help.",
    source: "Fiverr",
    verifyUrl: social.fiverrProfile,
  },
];

export const testimonialsFor = (slug: string) =>
  testimonials.filter((t) => t.serviceSlug === slug);

export const featuredTestimonials = testimonials.filter((t) => t.featured);

/**
 * `/reviews` filter chips. Each chip links to `?service=<first slug>`; any
 * slug in the group selects the whole group, so `?service=eb1c` shows EB-1B/C.
 */
export const reviewFilters = [
  { label: "EB-2 NIW", slugs: ["eb2-niw"] },
  { label: "EB-1A", slugs: ["eb1a"] },
  { label: "EB-1B / EB-1C", slugs: ["eb1b", "eb1c"] },
  { label: "RFE / NOID", slugs: ["rfe-response", "noid-response"] },
  { label: "Letters", slugs: ["recommendation-letters", "expert-opinion-letters"] },
  { label: "Other visas", slugs: otherVisas.map((s) => s.slug) },
] as const;

export type ReviewFilter = (typeof reviewFilters)[number];

export const findReviewFilter = (slug: string | undefined) =>
  reviewFilters.find((f) => (f.slugs as readonly string[]).includes(slug ?? ""));

export const testimonialsMatching = (filter: ReviewFilter | undefined) =>
  filter
    ? testimonials.filter((t) => (filter.slugs as readonly string[]).includes(t.serviceSlug ?? ""))
    : testimonials;
