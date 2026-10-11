/** Testimonials (ADR-029): the one implementation behind the EJS pages and /api/v1/admin/testimonials. */
const Testimonial = require('../../models/admin/Testimonial');
const { invalid, notFound, isId, searchRegex, pageParams, paged, normalize, auditContent } = require('./common');

const STATUSES = Testimonial.schema.path('status').enumValues;

const SPEC = {
  name: { type: 'text', label: 'Name', required: true, max: 120 },
  country: { type: 'text', label: 'Country', max: 80, default: '' },
  profession: { type: 'text', label: 'Profession', max: 120, default: '' },
  service: { type: 'text', label: 'Service', max: 80, default: '' },
  review: { type: 'text', label: 'Review', required: true, max: 3000 },
  rating: { type: 'int', label: 'Rating', min: 1, max: 5, default: 5 },
  photo: { type: 'url', label: 'Photo', relative: true, max: 500, default: '' },
  // Shown to visitors as the "verify this review" link, so it must be a real web address — never javascript: or data:.
  verificationUrl: { type: 'url', label: 'Verification URL', max: 500, default: '' },
  featured: { type: 'bool', label: 'Featured', default: false },
  displayOrder: { type: 'int', label: 'Display order', min: 0, max: 100000, default: 0 },
  status: { type: 'enum', label: 'Status', values: STATUSES, default: 'published' },
};

const toDto = (item, { canManage = false } = {}) => ({
  id: String(item._id),
  name: item.name,
  country: item.country || '',
  profession: item.profession || '',
  service: item.service || '',
  review: item.review,
  rating: item.rating || 5,
  photo: item.photo || '',
  verificationUrl: item.verificationUrl || '',
  featured: !!item.featured,
  displayOrder: item.displayOrder || 0,
  status: item.status,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
  actions: { edit: canManage, delete: canManage },
});

function read(input, partial) {
  const { values, errors } = normalize(SPEC, input, { partial });
  if (Object.keys(errors).length) throw invalid(errors);
  return values;
}

async function find(id) {
  const item = isId(String(id)) ? await Testimonial.findById(id).lean() : null;
  if (!item) throw notFound('Testimonial');
  return item;
}

async function list(query = {}, options) {
  const filter = {};
  if (STATUSES.includes(query.status)) filter.status = query.status;
  const term = searchRegex(query.search);
  if (term) filter.$or = [{ name: term }, { review: term }];
  const paging = pageParams(query);
  const [total, items] = await Promise.all([
    Testimonial.countDocuments(filter),
    Testimonial.find(filter).sort({ displayOrder: 1, createdAt: -1, _id: -1 }).skip(paging.skip).limit(paging.limit).lean(),
  ]);
  return { ...paged(items.map((item) => toDto(item, options)), total, paging), statuses: STATUSES };
}

const get = async (id, options) => toDto(await find(id), options);

async function create(ctx, input) {
  const item = await Testimonial.create(read(input, false));
  await auditContent(ctx, 'testimonial', item._id, 'created');
  return item.toObject();
}

async function update(ctx, id, input) {
  const existing = await find(id);
  await Testimonial.updateOne({ _id: existing._id }, { $set: read(input, true) }, { runValidators: true });
  await auditContent(ctx, 'testimonial', existing._id, 'updated');
  return find(id);
}

async function remove(ctx, id) {
  const existing = await find(id);
  await Testimonial.deleteOne({ _id: existing._id });
  await auditContent(ctx, 'testimonial', existing._id, 'deleted');
}

module.exports = { list, get, create, update, remove, toDto, STATUSES };
