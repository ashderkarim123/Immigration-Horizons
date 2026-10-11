/** FAQs (ADR-029): the one implementation behind the EJS FAQ pages and /api/v1/admin/faqs. */
const FAQ = require('../../models/admin/FAQ');
const servicesList = require('../../utils/services');
const { invalid, notFound, isId, searchRegex, pageParams, paged, normalize, auditContent } = require('./common');

const STATUSES = FAQ.schema.path('status').enumValues;
const serviceSlugs = () => servicesList.map((service) => service.slug);

const SPEC = {
  question: { type: 'text', label: 'Question', required: true, max: 300 },
  answer: { type: 'text', label: 'Answer', required: true, max: 5000 },
  category: { type: 'text', label: 'Category', max: 80, default: 'General' },
  displayOrder: { type: 'int', label: 'Display order', min: 0, max: 100000, default: 0 },
  showOnHomepage: { type: 'bool', label: 'Show on homepage', default: false },
  showOnServicePage: { type: 'text', label: 'Service page', max: 80, default: '' },
  schemaEnabled: { type: 'bool', label: 'Include in FAQ schema', default: true },
  status: { type: 'enum', label: 'Status', values: STATUSES, default: 'published' },
};

const toDto = (faq, { canManage = false } = {}) => ({
  id: String(faq._id),
  question: faq.question,
  answer: faq.answer,
  category: faq.category || 'General',
  displayOrder: faq.displayOrder || 0,
  showOnHomepage: !!faq.showOnHomepage,
  showOnServicePage: faq.showOnServicePage || '',
  schemaEnabled: faq.schemaEnabled !== false,
  status: faq.status,
  createdAt: faq.createdAt,
  updatedAt: faq.updatedAt,
  actions: { edit: canManage, delete: canManage },
});

function read(input, { partial, existing }) {
  const { values, errors } = normalize(SPEC, input, { partial });
  if (values.category === '') values.category = 'General';
  // Targeting must name a real service page — or be left exactly as an older record already had it.
  const target = values.showOnServicePage;
  if (target && !serviceSlugs().includes(target) && !(existing && existing.showOnServicePage === target)) {
    errors.showOnServicePage = 'Service page must be one of the listed services.';
  }
  if (Object.keys(errors).length) throw invalid(errors);
  return values;
}

async function find(id) {
  const faq = isId(String(id)) ? await FAQ.findById(id).lean() : null;
  if (!faq) throw notFound('FAQ');
  return faq;
}

async function list(query = {}, options) {
  const filter = {};
  if (STATUSES.includes(query.status)) filter.status = query.status;
  if (typeof query.category === 'string' && query.category && query.category !== 'all') filter.category = query.category.slice(0, 80);
  const term = searchRegex(query.search);
  if (term) filter.question = term;
  const paging = pageParams(query);
  const [total, faqs, categories] = await Promise.all([
    FAQ.countDocuments(filter),
    FAQ.find(filter).sort({ displayOrder: 1, createdAt: -1, _id: -1 }).skip(paging.skip).limit(paging.limit).lean(),
    FAQ.distinct('category'),
  ]);
  return { ...paged(faqs.map((faq) => toDto(faq, options)), total, paging), categories: categories.filter(Boolean).sort(), statuses: STATUSES, serviceSlugs: serviceSlugs() };
}

const get = async (id, options) => toDto(await find(id), options);

async function create(ctx, input) {
  const faq = await FAQ.create(read(input, { partial: false }));
  await auditContent(ctx, 'faq', faq._id, 'created');
  return faq.toObject();
}

async function update(ctx, id, input) {
  const existing = await find(id);
  await FAQ.updateOne({ _id: existing._id }, { $set: read(input, { partial: true, existing }) }, { runValidators: true });
  await auditContent(ctx, 'faq', existing._id, 'updated');
  return find(id);
}

async function remove(ctx, id) {
  const existing = await find(id);
  await FAQ.deleteOne({ _id: existing._id });
  await auditContent(ctx, 'faq', existing._id, 'deleted');
}

module.exports = { list, get, create, update, remove, toDto, STATUSES, serviceSlugs };
