/**
 * SEO metadata and the code-owned service catalogue (ADR-029): the one implementation behind the EJS SEO/Services
 * pages and /api/v1/admin/{seo,services}. The page registry is fixed here — an edit can only target a registered
 * page, or a custom record that already exists, so nothing can be orphaned by a mistyped reference.
 */
const SEOMeta = require('../../models/admin/SEOMeta');
const servicesList = require('../../utils/services');
const { invalid, notFound, normalize, auditContent, publicOrigin } = require('./common');


const STATIC_PAGES = [
  { ref: 'home', label: 'Homepage', path: '/' },
  { ref: 'about', label: 'About', path: '/about' },
  { ref: 'contact', label: 'Contact', path: '/contact' },
  { ref: 'services', label: 'Services', path: '/services' },
  { ref: 'blog', label: 'Blog', path: '/blog' },
  { ref: 'reviews', label: 'Reviews', path: '/reviews' },
  { ref: 'consultation', label: 'Consultation', path: '/consultation' },
  { ref: 'privacy', label: 'Privacy Policy', path: '/privacy' },
  { ref: 'terms', label: 'Terms', path: '/terms' },
  { ref: 'resources', label: 'Resources', path: '/resources' },
  // `path: null` = no public preview link: the 404 page has no address, and the legacy landing routes are not
  // served by the current public site.
  { ref: '404', label: '404 Page', path: null },
  { ref: 'eb2-niw', label: 'EB-2 NIW Landing', pageType: 'landing', path: null },
  { ref: 'eb1a', label: 'EB-1A Landing', pageType: 'landing', path: null },
  { ref: 'o1-visa', label: 'O-1 Visa Landing', pageType: 'landing', path: null },
];
const servicePageRef = (slug) => `service-${slug}`;
const SEO_PAGES = [
  ...STATIC_PAGES.map((page) => ({ pageType: 'static', ...page })),
  ...servicesList.map((service) => ({ ref: servicePageRef(service.slug), label: `Service: ${service.name}`, pageType: 'service', path: `/services/${service.slug}` })),
];

const ROBOTS_DIRECTIVES = ['index', 'noindex', 'follow', 'nofollow', 'noarchive', 'nosnippet', 'noimageindex'];
const SCHEMA_TYPES = ['WebPage', 'AboutPage', 'ContactPage', 'CollectionPage', 'FAQPage', 'Article', 'BlogPosting', 'Service', 'ProfessionalService', 'Organization'];

const SPEC = {
  seoTitle: { type: 'text', label: 'SEO title', max: 200, default: '' },
  metaDescription: { type: 'text', label: 'Meta description', max: 500, default: '' },
  keywords: { type: 'text', label: 'Keywords', max: 500, default: '' },
  canonicalUrl: { type: 'url', label: 'Canonical URL', relative: true, max: 500, default: '' },
  ogTitle: { type: 'text', label: 'Open Graph title', max: 200, default: '' },
  ogDescription: { type: 'text', label: 'Open Graph description', max: 500, default: '' },
  ogImage: { type: 'url', label: 'Open Graph image', relative: true, max: 500, default: '' },
  twitterImage: { type: 'url', label: 'Twitter image', relative: true, max: 500, default: '' },
  slug: { type: 'text', label: 'Slug', max: 200, default: '' },
  robots: { type: 'text', label: 'Robots', max: 120, default: 'index,follow' },
  noindex: { type: 'bool', label: 'Noindex', default: false },
  schemaType: { type: 'text', label: 'Schema type', max: 40, default: 'WebPage' },
};
const FIELDS = Object.keys(SPEC);

function toDto(page, stored, { canManage = false } = {}) {
  const dto = {
    pageRef: page.ref,
    label: page.label,
    pageType: (stored && stored.pageType) || page.pageType || 'static',
    publicUrl: page.path ? publicOrigin() + page.path : null,
    configured: !!stored,
    updatedAt: stored ? stored.updatedAt : null,
    actions: { edit: canManage },
  };
  for (const field of FIELDS) dto[field] = stored && stored[field] !== undefined && stored[field] !== null ? stored[field] : SPEC[field].default;
  return dto;
}

/** A registered page, or a custom record that is already stored; anything else does not exist. */
async function resolve(pageRef) {
  const ref = typeof pageRef === 'string' ? pageRef : '';
  const stored = ref ? await SEOMeta.findOne({ pageRef: ref }).lean() : null;
  const page = SEO_PAGES.find((candidate) => candidate.ref === ref) || (stored ? { ref, label: ref, pageType: stored.pageType || 'custom', path: null } : null);
  if (!page) throw notFound('SEO page');
  return { page, stored };
}

async function list(options) {
  const stored = await SEOMeta.find().lean();
  const byRef = new Map(stored.map((meta) => [meta.pageRef, meta]));
  const known = new Set(SEO_PAGES.map((page) => page.ref));
  const custom = stored.filter((meta) => !known.has(meta.pageRef)).map((meta) => ({ ref: meta.pageRef, label: meta.pageRef, pageType: meta.pageType || 'custom', path: null }));
  return { items: [...SEO_PAGES, ...custom].map((page) => toDto(page, byRef.get(page.ref), options)), robotsDirectives: ROBOTS_DIRECTIVES, schemaTypes: SCHEMA_TYPES };
}

async function get(pageRef, options) {
  const { page, stored } = await resolve(pageRef);
  return toDto(page, stored, options);
}

/** A full replacement of the page's metadata (PUT): omitted fields return to their defaults, as the EJS form posts. */
async function save(ctx, pageRef, input) {
  const { page, stored } = await resolve(pageRef);
  const { values, errors } = normalize(SPEC, input);
  const unchanged = (field) => stored && stored[field] === values[field];

  if (values.robots !== undefined && !errors.robots) {
    const directives = values.robots.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean);
    if (!directives.length) values.robots = 'index,follow';
    else if (directives.some((directive) => !ROBOTS_DIRECTIVES.includes(directive)) && !unchanged('robots')) errors.robots = `Robots may only use: ${ROBOTS_DIRECTIVES.join(', ')}.`;
    else if (!unchanged('robots')) values.robots = directives.join(',');
  }
  if (values.schemaType === '') values.schemaType = 'WebPage';
  if (values.schemaType && !SCHEMA_TYPES.includes(values.schemaType) && !unchanged('schemaType')) errors.schemaType = `Schema type must be one of: ${SCHEMA_TYPES.join(', ')}.`;
  if (values.slug && !/^[a-z0-9]+(?:[-/][a-z0-9]+)*$/.test(values.slug) && !unchanged('slug')) errors.slug = 'Slug may contain only lowercase letters, numbers, hyphens and slashes.';
  if (Object.keys(errors).length) throw invalid(errors);

  await SEOMeta.updateOne(
    { pageRef: page.ref },
    { $set: { ...values, pageRef: page.ref, pageType: (stored && stored.pageType !== 'static' && stored.pageType) || page.pageType || 'static' } },
    { upsert: true, runValidators: true },
  );
  await auditContent(ctx, 'seo_meta', page.ref, stored ? 'updated' : 'created');
  return get(page.ref, { canManage: true });
}

/** The code-owned service catalogue with a pointer to each service's SEO record. Read-only by design. */
async function listServices() {
  const refs = servicesList.map((service) => servicePageRef(service.slug));
  const stored = await SEOMeta.find({ pageRef: { $in: refs } }).select('pageRef seoTitle metaDescription noindex').lean();
  const byRef = new Map(stored.map((meta) => [meta.pageRef, meta]));
  return servicesList.map((service) => {
    const meta = byRef.get(servicePageRef(service.slug));
    return {
      slug: service.slug,
      title: service.name,
      tagline: service.tagline || '',
      publicUrl: `${publicOrigin()}/services/${service.slug}`,
      seoPageRef: servicePageRef(service.slug),
      seo: { configured: !!meta, seoTitle: (meta && meta.seoTitle) || '', hasDescription: !!(meta && meta.metaDescription), noindex: !!(meta && meta.noindex) },
    };
  });
}

module.exports = { list, get, save, resolve, listServices, SEO_PAGES, ROBOTS_DIRECTIVES, SCHEMA_TYPES, servicePageRef };
