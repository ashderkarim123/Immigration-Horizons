import { social } from "./site";

/**
 * Client testimonials sourced from the Fiverr gig reviews and inbox. Every
 * entry links back to the public profile so a visitor can verify it — that
 * verifiability is the point, so `verifyUrl` is required, not optional.
 */
export type Testimonial = {
  id: string;
  name: string;
  location: string;
  service: string;
  rating: number;
  date: string;
  text: string;
  source: string;
  verifyUrl: string;
};

export const testimonials: Testimonial[] = [
  {
    id: "juliet-mirambo",
    name: "Juliet Mirambo",
    location: "United States",
    service: "EB-1A",
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
