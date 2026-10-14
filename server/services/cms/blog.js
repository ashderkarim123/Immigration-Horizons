/** Blog posts (ADR-029): the one implementation behind the EJS Blog pages and /api/v1/admin/blog. */
const slugify = require('slugify');
const BlogPost = require('../../models/BlogPost');
const categories = require('../../utils/blogCategories');
const { sanitizeBlogContent, hasVisibleContent } = require('../../utils/blogHtml');
const { invalid, notFound, conflict, isId, searchRegex, pageParams, paged, normalize, auditContent, publicOrigin } = require('./common');

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEFAULT_AUTHOR = 'Immigration Horizons Team';

const SPEC = {
  title: { type: 'text', label: 'Title', required: true, max: 200 },
  slug: { type: 'text', label: 'Slug', max: 200 },
  category: { type: 'enum', label: 'Category', values: categories, default: 'Immigration Tips' },
  excerpt: { type: 'text', label: 'Excerpt', required: true, max: 300 },
  content: { type: 'text', label: 'Content', required: true, max: 500000 },
  coverImage: { type: 'url', label: 'Cover image', relative: true, max: 500, default: '' },
  author: { type: 'text', label: 'Author', max: 120, default: DEFAULT_AUTHOR },
  tags: { type: 'tags', label: 'Tags', default: () => [] },
  readingTime: { type: 'int', label: 'Reading time', min: 0, max: 600, default: 0 },
  // An omitted flag never publishes: the model's own default is `true`.
  published: { type: 'bool', label: 'Published', default: false },
  publishDate: { type: 'date', label: 'Publish date' },
};

/** The same rule the public site applies (src/lib/blogs.ts): published, and not scheduled for the future. */
const isLive = (post, now = new Date()) => !!post.published && (!post.publishDate || post.publishDate <= now);

function toDto(post, { canManage = false, withContent = true } = {}) {
  const dto = {
    id: String(post._id),
    title: post.title,
    slug: post.slug,
    category: post.category || 'Immigration Tips',
    excerpt: post.excerpt,
    coverImage: post.coverImage || '',
    author: post.author || DEFAULT_AUTHOR,
    tags: post.tags || [],
    readingTime: post.readingTime || 0,
    published: !!post.published,
    publishDate: post.publishDate || null,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    // Only a post the public site would actually serve gets a link; a draft has no public URL to leak.
    previewUrl: isLive(post) ? `${publicOrigin()}/blog/${encodeURIComponent(post.slug)}` : null,
    actions: { edit: canManage, publish: canManage, delete: canManage },
  };
  if (withContent) dto.content = post.content;
  return dto;
}

function read(input, { partial, existing }) {
  const { values, errors } = normalize(SPEC, input, { partial });
  if (values.content !== undefined) {
    values.content = sanitizeBlogContent(values.content);
    if (!hasVisibleContent(values.content)) errors.content = 'Content is required.';
  }
  if (values.author === '') values.author = DEFAULT_AUTHOR;
  if (values.slug === '') delete values.slug; // blank means "keep / generate", exactly as the EJS form always did
  // A legacy slug that is merely being re-saved is left alone; a new or changed one must be URL-safe.
  if (values.slug !== undefined && !(existing && values.slug === existing.slug) && !SLUG_PATTERN.test(values.slug)) {
    errors.slug = 'Slug may contain only lowercase letters, numbers and single hyphens.';
  }
  if (Object.keys(errors).length) throw invalid(errors);
  return values;
}

async function assertSlugFree(slug, exceptId) {
  const clash = await BlogPost.exists({ slug, ...(exceptId ? { _id: { $ne: exceptId } } : {}) });
  if (clash) throw conflict('slug', 'Another post already uses that slug. Choose a different one.');
}
const duplicateKey = (error) => (error && error.code === 11000 ? conflict('slug', 'Another post already uses that slug. Choose a different one.') : error);

async function find(id) {
  const post = isId(String(id)) ? await BlogPost.findById(id).lean() : null;
  if (!post) throw notFound('Blog post');
  return post;
}

async function list(query = {}, options) {
  const filter = {};
  if (query.status === 'published') filter.published = true;
  else if (query.status === 'draft') filter.published = false;
  if (categories.includes(query.category)) filter.category = query.category;
  const term = searchRegex(query.search);
  if (term) filter.$or = [{ title: term }, { excerpt: term }];
  const paging = pageParams(query);
  const [total, posts] = await Promise.all([
    BlogPost.countDocuments(filter),
    BlogPost.find(filter).select('-content').sort({ createdAt: -1, _id: -1 }).skip(paging.skip).limit(paging.limit).lean(),
  ]);
  return { ...paged(posts.map((post) => toDto(post, { ...options, withContent: false })), total, paging), categories };
}

const get = async (id, options) => toDto(await find(id), options);

async function create(ctx, input) {
  const values = read(input, { partial: false });
  values.slug = values.slug || slugify(values.title, { lower: true, strict: true });
  if (!values.slug) throw invalid({ slug: 'Enter a slug: one could not be made from this title.' });
  await assertSlugFree(values.slug);
  if (values.published && !values.publishDate) values.publishDate = new Date();
  let post;
  try { post = await BlogPost.create(values); } catch (error) { throw duplicateKey(error); }
  await auditContent(ctx, 'blog_post', post._id, 'created');
  return post.toObject();
}

async function update(ctx, id, input) {
  const existing = await find(id);
  const values = read(input, { partial: true, existing });
  if (values.slug && values.slug !== existing.slug) await assertSlugFree(values.slug, existing._id);
  const published = values.published ?? existing.published;
  const publishDate = values.publishDate !== undefined ? values.publishDate : existing.publishDate;
  if (published && !publishDate) values.publishDate = new Date();
  try {
    // updateOne, not save(): a legacy row must stay editable field by field.
    await BlogPost.updateOne({ _id: existing._id }, { $set: values }, { runValidators: true });
  } catch (error) { throw duplicateKey(error); }
  await auditContent(ctx, 'blog_post', existing._id, 'updated');
  return find(id);
}

async function setPublished(ctx, id, published) {
  if (typeof published !== 'boolean') throw invalid({ published: 'Published must be true or false.' });
  const existing = await find(id);
  const set = { published };
  if (published && !existing.publishDate) set.publishDate = new Date();
  await BlogPost.updateOne({ _id: existing._id }, { $set: set });
  await auditContent(ctx, 'blog_post', existing._id, published ? 'published' : 'unpublished');
  return find(id);
}

async function remove(ctx, id) {
  const existing = await find(id);
  await BlogPost.deleteOne({ _id: existing._id });
  await auditContent(ctx, 'blog_post', existing._id, 'deleted');
}

module.exports = { list, get, find, create, update, setPublished, remove, toDto, isLive, categories };
