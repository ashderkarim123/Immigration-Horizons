/**
 * Seeds the CMS with the existing static content so the panel has data to
 * manage from day one. Idempotent — safe to run more than once.
 *
 *   npm run seed
 */
require('dotenv').config();
const mongoose = require('mongoose');

const connectDB = require('../config/db');
const testimonials = require('../utils/testimonials');
const social = require('../utils/social');

const Testimonial = require('../models/admin/Testimonial');
const FAQ = require('../models/admin/FAQ');
const Setting = require('../models/admin/Setting');

const DEFAULT_FAQS = [
  {
    question: 'Are you an immigration law firm?',
    answer:
      'No. Immigration Horizons is an immigration consulting and paralegal services practice. We prepare petitions, draft documents, conduct research, organise evidence, and assist with USCIS forms and packaging. We are not attorneys and do not provide legal advice.',
    category: 'General', displayOrder: 0, showOnHomepage: true,
  },
  {
    question: 'Can you help if I have already received an RFE?',
    answer:
      'Yes, including on petitions we did not originally prepare. We review the notice, identify what the officer is questioning, and prepare a focused response addressing those specific points with supporting evidence.',
    category: 'General', displayOrder: 1, showOnHomepage: true,
  },
  {
    question: 'Can I hire you for just one document instead of a full petition?',
    answer:
      'Yes. Every deliverable can be engaged on its own — a recommendation letter set, an expert opinion letter, a business or endeavor plan, an evidence package, or an RFE response.',
    category: 'General', displayOrder: 2, showOnHomepage: true,
  },
];

const DEFAULT_SETTINGS = [
  ['general', 'companyName', 'Immigration Horizons'],
  ['general', 'email', process.env.CONTACT_RECEIVER_EMAIL || 'info@immigrationhorizons.com'],
  ['general', 'whatsapp1', process.env.WHATSAPP_NUMBER_1 || '923305507598'],
  ['general', 'whatsapp2', process.env.WHATSAPP_NUMBER_2 || '923418883635'],
  ['social', 'fiverr', social.FIVERR_PROFILE_URL],
  ['social', 'upwork', social.UPWORK_PROFILE_URL],
  ['analytics', 'ga4Id', process.env.GA4_ID || 'G-XYD4F5BE1F'],
  ['seo_defaults', 'organizationName', 'Immigration Horizons'],
  ['seo_defaults', 'organizationLogo', '/images/logo-header.png'],
];

async function run() {
  await connectDB();
  if (mongoose.connection.readyState !== 1) {
    await new Promise((resolve, reject) => {
      mongoose.connection.once('connected', resolve);
      mongoose.connection.once('error', reject);
      setTimeout(() => reject(new Error('Mongo connection timed out')), 15000);
    });
  }

  let tCount = 0;
  for (let i = 0; i < testimonials.length; i += 1) {
    const t = testimonials[i];
    const exists = await Testimonial.findOne({ name: t.name, review: t.text });
    if (exists) continue;
    await Testimonial.create({
      name: t.name,
      country: t.country || '',
      profession: t.service || '',
      review: t.text,
      rating: t.rating || 5,
      verificationUrl: t.verifyUrl || social.FIVERR_PROFILE_URL,
      status: 'published',
      displayOrder: i,
    });
    tCount += 1;
  }
  console.log(`Testimonials: ${tCount} inserted`);

  let fCount = 0;
  for (const f of DEFAULT_FAQS) {
    const res = await FAQ.updateOne({ question: f.question }, { $setOnInsert: f }, { upsert: true });
    if (res.upsertedCount) fCount += 1;
  }
  console.log(`FAQs: ${fCount} inserted`);

  let sCount = 0;
  for (const [group, key, value] of DEFAULT_SETTINGS) {
    const res = await Setting.updateOne({ group, key }, { $setOnInsert: { group, key, value } }, { upsert: true });
    if (res.upsertedCount) sCount += 1;
  }
  console.log(`Settings: ${sCount} inserted`);

  console.log('Seed complete.');
  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
