const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

// Models
const BlogPost = require('../../models/BlogPost');
const Consultation = require('../../models/Consultation');
const Comment = require('../../models/Comment');
const Testimonial = require('../../models/admin/Testimonial');
const FAQ = require('../../models/admin/FAQ');
const Setting = require('../../models/admin/Setting');
const SEOMeta = require('../../models/admin/SEOMeta');
const AdminUser = require('../../models/admin/User');
const InternalNote = require('../../models/admin/InternalNote');
const Media = require('../../models/admin/Media');

const { requireAdmin } = require('../../middleware/auth');
const upload = require('../../middleware/upload');
const categories = require('../../utils/blogCategories');
const servicesList = require('../../utils/services');

// ========================================================================
// AUTHENTICATION
// ========================================================================

router.get('/admin/login', (req, res) => {
  if (req.session && req.session.isAdmin) return res.redirect('/admin');
  res.render('admin/login', {
    title: 'Admin Login | Immigration Horizons',
    layout: false,
    error: null,
  });
});

router.post('/admin/login', async (req, res) => {
  const { username, password } = req.body;

  // Check admin users in DB first
  if (mongoose.connection.readyState === 1) {
    try {
      const user = await AdminUser.findOne({ email: username, isActive: true });
      if (user && (await user.comparePassword(password))) {
        req.session.isAdmin = true;
        req.session.adminUser = { id: user._id, name: user.name, role: user.role };
        return res.redirect('/admin');
      }
    } catch (_) { /* fall through to env-based auth */ }
  }

  // Fallback to env-based auth
  const validUsername = process.env.ADMIN_USERNAME || 'admin';
  const validPasswordPlain = process.env.ADMIN_PASSWORD || 'admin';
  let ok = false;
  if (process.env.ADMIN_PASSWORD_HASH) {
    ok = username === validUsername && (await bcrypt.compare(password || '', process.env.ADMIN_PASSWORD_HASH));
  } else {
    ok = username === validUsername && password === validPasswordPlain;
  }

  if (!ok) {
    return res.render('admin/login', {
      title: 'Admin Login | Immigration Horizons',
      layout: false,
      error: 'Invalid username or password.',
    });
  }

  req.session.isAdmin = true;
  req.session.adminUser = { name: 'Admin', role: 'super_admin' };
  res.redirect('/admin');
});

router.post('/admin/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// ========================================================================
// ADMIN LAYOUT MIDDLEWARE
// ========================================================================

router.use('/admin', requireAdmin, (req, res, next) => {
  res.locals.adminUser = req.session.adminUser || { name: 'Admin', role: 'super_admin' };
  res.locals.currentAdminPath = req.path;
  // Use admin layout instead of default public layout
  res.locals.layout = 'admin/layout';
  next();
});

// ========================================================================
// DASHBOARD
// ========================================================================

router.get('/admin', async (req, res) => {
  try {
    const [
      totalLeads,
      newLeadsToday,
      leadsThisMonth,
      blogPosts,
      publishedPosts,
      draftPosts,
      testimonials,
      faqs,
      recentLeads,
      recentPosts,
    ] = await Promise.all([
      Consultation.countDocuments(),
      Consultation.countDocuments({
        createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      }),
      Consultation.countDocuments({
        createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      }),
      BlogPost.countDocuments(),
      BlogPost.countDocuments({ published: true }),
      BlogPost.countDocuments({ published: false }),
      Testimonial.countDocuments(),
      FAQ.countDocuments(),
      Consultation.find().sort({ createdAt: -1 }).limit(10),
      BlogPost.find().sort({ createdAt: -1 }).limit(5),
    ]);

    res.render('admin/dashboard', {
      title: 'Dashboard | Admin',
      stats: {
        totalLeads,
        newLeadsToday,
        leadsThisMonth,
        blogPosts,
        publishedPosts,
        draftPosts,
        testimonials,
        faqs,
      },
      recentLeads,
      recentPosts,
      currentPage: 'dashboard',
    });
  } catch (err) {
    console.error('[admin/dashboard]', err.message);
    res.render('admin/dashboard', {
      title: 'Dashboard | Admin',
      stats: {},
      recentLeads: [],
      recentPosts: [],
      currentPage: 'dashboard',
    });
  }
});

// ========================================================================
// LEADS MANAGEMENT
// ========================================================================

const LEAD_STATUSES = ['new', 'contacted', 'consultation_scheduled', 'in_progress', 'closed'];

router.get('/admin/leads', async (req, res) => {
  try {
    const { search, status, service, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (status && status !== 'all') filter.status = status;
    if (service && service !== 'all') filter.service = service;
    if (search) {
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: safe, $options: 'i' } },
        { email: { $regex: safe, $options: 'i' } },
        { phone: { $regex: safe, $options: 'i' } },
        { message: { $regex: safe, $options: 'i' } },
      ];
    }

    const total = await Consultation.countDocuments(filter);
    const leads = await Consultation.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const serviceCounts = await Consultation.aggregate([
      { $group: { _id: '$service', count: { $sum: 1 } } },
    ]);
    const countsByService = Object.fromEntries(serviceCounts.map((s) => [s._id, s.count]));

    res.render('admin/leads/index', {
      title: 'Leads | Admin',
      leads,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit),
      search: search || '',
      statusFilter: status || 'all',
      serviceFilter: service || 'all',
      serviceCategories: Consultation.schema.path('service').enumValues,
      leadStatuses: LEAD_STATUSES,
      countsByService,
      currentPage: 'leads',
    });
  } catch (err) {
    console.error('[admin/leads]', err.message);
    res.redirect('/admin');
  }
});

router.get('/admin/leads/:id', async (req, res) => {
  try {
    const lead = await Consultation.findById(req.params.id).lean();
    if (!lead) return res.redirect('/admin/leads');

    const notes = await InternalNote.find({ leadId: req.params.id })
      .sort({ createdAt: -1 })
      .lean();

    res.render('admin/leads/detail', {
      title: `Lead: ${lead.name} | Admin`,
      lead,
      notes,
      leadStatuses: LEAD_STATUSES,
      currentPage: 'leads',
    });
  } catch (err) {
    console.error('[admin/leads/detail]', err.message);
    res.redirect('/admin/leads');
  }
});

router.post('/admin/leads/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (LEAD_STATUSES.includes(status)) {
      await Consultation.findByIdAndUpdate(req.params.id, { status });
    }
    res.redirect(req.headers.referer || '/admin/leads');
  } catch (err) {
    console.error('[admin/leads/status]', err.message);
    res.redirect('/admin/leads');
  }
});

router.post('/admin/leads/:id/notes', async (req, res) => {
  try {
    const { content } = req.body;
    if (content && content.trim()) {
      await InternalNote.create({
        leadId: req.params.id,
        author: req.session.adminUser?.name || 'Admin',
        content: content.trim(),
      });
    }
    res.redirect(`/admin/leads/${req.params.id}`);
  } catch (err) {
    console.error('[admin/leads/notes]', err.message);
    res.redirect(`/admin/leads/${req.params.id}`);
  }
});

router.delete('/admin/leads/:id', async (req, res) => {
  try {
    await InternalNote.deleteMany({ leadId: req.params.id });
    await Consultation.findByIdAndDelete(req.params.id);
    res.redirect('/admin/leads');
  } catch (err) {
    console.error('[admin/leads/delete]', err.message);
    res.redirect('/admin/leads');
  }
});

router.get('/admin/leads/export/csv', async (req, res) => {
  try {
    const { status, service, search } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (service && service !== 'all') filter.service = service;
    if (search) {
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: safe, $options: 'i' } },
        { email: { $regex: safe, $options: 'i' } },
      ];
    }

    const leads = await Consultation.find(filter).sort({ createdAt: -1 }).lean();

    const headers = [
      'Name', 'Email', 'Phone', 'Country', 'Occupation', 'Service', 'Message',
      'Status', 'Source', 'Date Submitted',
    ];

    const rows = leads.map((l) => [
      l.name,
      l.email,
      l.phone || '',
      l.country || '',
      l.occupation || '',
      l.service || '',
      `"${(l.message || '').replace(/"/g, '""')}"`,
      l.status || 'new',
      l.source || '',
      l.createdAt ? new Date(l.createdAt).toISOString() : '',
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=leads-${Date.now()}.csv`);
    res.send(csv);
  } catch (err) {
    console.error('[admin/leads/export]', err.message);
    res.redirect('/admin/leads');
  }
});

// ========================================================================
// BLOG MANAGEMENT
// ========================================================================

router.get('/admin/blog', async (req, res) => {
  try {
    const { search, status, category, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (status === 'published') filter.published = true;
    else if (status === 'draft') filter.published = false;
    if (category && category !== 'all') filter.category = category;
    if (search) {
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { title: { $regex: safe, $options: 'i' } },
        { excerpt: { $regex: safe, $options: 'i' } },
      ];
    }

    const total = await BlogPost.countDocuments(filter);
    const posts = await BlogPost.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    res.render('admin/blog/index', {
      title: 'Blog Posts | Admin',
      posts,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit),
      search: search || '',
      statusFilter: status || 'all',
      categoryFilter: category || 'all',
      categories,
      currentPage: 'blog',
    });
  } catch (err) {
    console.error('[admin/blog]', err.message);
    res.redirect('/admin');
  }
});

router.get('/admin/blog/new', (req, res) => {
  res.render('admin/blog/form', {
    title: 'New Blog Post | Admin',
    post: null,
    categories,
    error: null,
    currentPage: 'blog',
  });
});

router.post('/admin/blog', requireAdmin, upload.single('coverImage'), async (req, res) => {
  try {
    const { title, slug, category, excerpt, content, tags, author, readingTime, published, publishDate } = req.body;

    const postData = {
      title,
      slug: slug || undefined,
      category,
      excerpt,
      content,
      tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      author: author || 'Immigration Horizons Team',
      readingTime: Number(readingTime) || 0,
      coverImage: req.file ? `/uploads/${req.file.filename}` : (req.body.coverImageUrl || ''),
      published: published === 'on' || published === 'true',
    };

    if (publishDate) postData.publishDate = new Date(publishDate);
    // If published but no publishDate, set it
    if (postData.published && !postData.publishDate) {
      postData.publishDate = new Date();
    }

    await BlogPost.create(postData);
    res.redirect('/admin/blog');
  } catch (err) {
    res.render('admin/blog/form', {
      title: 'New Blog Post | Admin',
      post: req.body,
      categories,
      error: err.message,
      currentPage: 'blog',
    });
  }
});

router.get('/admin/blog/:id/edit', async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id).lean();
    if (!post) return res.redirect('/admin/blog');
    res.render('admin/blog/form', {
      title: 'Edit Blog Post | Admin',
      post,
      categories,
      error: null,
      currentPage: 'blog',
    });
  } catch (err) {
    res.redirect('/admin/blog');
  }
});

router.put('/admin/blog/:id', requireAdmin, upload.single('coverImage'), async (req, res) => {
  try {
    const { title, slug, category, excerpt, content, tags, author, readingTime, published, publishDate } = req.body;

    const update = {
      title,
      category,
      excerpt,
      content,
      tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      author: author || 'Immigration Horizons Team',
      readingTime: Number(readingTime) || 0,
      published: published === 'on' || published === 'true',
    };

    if (slug && slug.trim()) update.slug = slug.trim();
    if (req.file) update.coverImage = `/uploads/${req.file.filename}`;
    else if (req.body.coverImageUrl) update.coverImage = req.body.coverImageUrl;
    if (publishDate) update.publishDate = new Date(publishDate);
    if (update.published && !update.publishDate) {
      update.publishDate = new Date();
    }

    await BlogPost.findByIdAndUpdate(req.params.id, { $set: update }, { runValidators: true });
    res.redirect('/admin/blog');
  } catch (err) {
    const post = await BlogPost.findById(req.params.id).lean();
    res.render('admin/blog/form', {
      title: 'Edit Blog Post | Admin',
      post: { ...post, ...req.body },
      categories,
      error: err.message,
      currentPage: 'blog',
    });
  }
});

router.delete('/admin/blog/:id', async (req, res) => {
  try {
    await BlogPost.findByIdAndDelete(req.params.id);
    res.redirect('/admin/blog');
  } catch (err) {
    res.redirect('/admin/blog');
  }
});

router.post('/admin/blog/:id/toggle-publish', async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (post) {
      post.published = !post.published;
      await post.save();
    }
    res.redirect('/admin/blog');
  } catch (err) {
    res.redirect('/admin/blog');
  }
});

// ========================================================================
// SEO MANAGER
// ========================================================================

const SEO_PAGES = [
  { ref: 'home', label: 'Homepage' },
  { ref: 'about', label: 'About' },
  { ref: 'contact', label: 'Contact' },
  { ref: 'services', label: 'Services' },
  { ref: 'blog', label: 'Blog' },
  { ref: 'reviews', label: 'Reviews' },
  { ref: 'consultation', label: 'Consultation' },
  { ref: 'privacy', label: 'Privacy Policy' },
  { ref: 'terms', label: 'Terms' },
  { ref: 'resources', label: 'Resources' },
  { ref: '404', label: '404 Page' },
  { ref: 'eb2-niw', label: 'EB-2 NIW Landing', pageType: 'landing' },
  { ref: 'eb1a', label: 'EB-1A Landing', pageType: 'landing' },
  { ref: 'o1-visa', label: 'O-1 Visa Landing', pageType: 'landing' },
];

// Add service pages to SEO list
servicesList.forEach((s) => {
  SEO_PAGES.push({ ref: `service-${s.slug}`, label: `Service: ${s.name}`, pageType: 'service' });
});

router.get('/admin/seo', async (req, res) => {
  try {
    const seoMetas = await SEOMeta.find().lean();
    const seoMap = {};
    seoMetas.forEach((s) => { seoMap[s.pageRef] = s; });

    res.render('admin/seo/index', {
      title: 'SEO Manager | Admin',
      pages: SEO_PAGES,
      seoMap,
      currentPage: 'seo',
    });
  } catch (err) {
    console.error('[admin/seo]', err.message);
    res.render('admin/seo/index', {
      title: 'SEO Manager | Admin',
      pages: SEO_PAGES,
      seoMap: {},
      currentPage: 'seo',
    });
  }
});

router.get('/admin/seo/:pageRef/edit', async (req, res) => {
  try {
    const seoMeta = await SEOMeta.findOne({ pageRef: req.params.pageRef }).lean();
    const pageInfo = SEO_PAGES.find((p) => p.ref === req.params.pageRef) || {
      ref: req.params.pageRef,
      label: req.params.pageRef,
      pageType: 'custom',
    };

    res.render('admin/seo/form', {
      title: `SEO: ${pageInfo.label} | Admin`,
      seo: seoMeta || { pageRef: req.params.pageRef, pageType: pageInfo.pageType || 'static' },
      pageInfo,
      error: null,
      currentPage: 'seo',
    });
  } catch (err) {
    res.redirect('/admin/seo');
  }
});

router.post('/admin/seo/:pageRef', async (req, res) => {
  try {
    const {
      seoTitle, metaDescription, keywords, canonicalUrl,
      ogTitle, ogDescription, ogImage, twitterImage,
      slug, robots, noindex, schemaType,
    } = req.body;

    await SEOMeta.findOneAndUpdate(
      { pageRef: req.params.pageRef },
      {
        pageRef: req.params.pageRef,
        seoTitle: seoTitle || '',
        metaDescription: metaDescription || '',
        keywords: keywords || '',
        canonicalUrl: canonicalUrl || '',
        ogTitle: ogTitle || '',
        ogDescription: ogDescription || '',
        ogImage: ogImage || '',
        twitterImage: twitterImage || '',
        slug: slug || '',
        robots: robots || 'index,follow',
        noindex: noindex === 'on' || noindex === 'true',
        schemaType: schemaType || 'WebPage',
      },
      { upsert: true, new: true }
    );

    res.redirect('/admin/seo');
  } catch (err) {
    const pageInfo = SEO_PAGES.find((p) => p.ref === req.params.pageRef) || { label: req.params.pageRef };
    res.render('admin/seo/form', {
      title: `SEO: ${pageInfo.label} | Admin`,
      seo: { ...req.body, pageRef: req.params.pageRef },
      pageInfo,
      error: err.message,
      currentPage: 'seo',
    });
  }
});

// ========================================================================
// TESTIMONIALS
// ========================================================================

router.get('/admin/testimonials', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;

    const total = await Testimonial.countDocuments(filter);
    const testimonials = await Testimonial.find(filter)
      .sort({ displayOrder: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    res.render('admin/testimonials/index', {
      title: 'Testimonials | Admin',
      testimonials,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit),
      statusFilter: status || 'all',
      currentPage: 'testimonials',
    });
  } catch (err) {
    console.error('[admin/testimonials]', err.message);
    res.redirect('/admin');
  }
});

router.get('/admin/testimonials/new', (req, res) => {
  res.render('admin/testimonials/form', {
    title: 'New Testimonial | Admin',
    testimonial: null,
    error: null,
    currentPage: 'testimonials',
  });
});

router.post('/admin/testimonials', upload.single('photo'), async (req, res) => {
  try {
    const { name, country, profession, review, rating, verificationUrl, featured, displayOrder, status } = req.body;
    await Testimonial.create({
      name,
      country: country || '',
      profession: profession || '',
      review,
      rating: Number(rating) || 5,
      photo: req.file ? `/uploads/${req.file.filename}` : (req.body.photoUrl || ''),
      verificationUrl: verificationUrl || '',
      featured: featured === 'on' || featured === 'true',
      displayOrder: Number(displayOrder) || 0,
      status: status || 'published',
    });
    res.redirect('/admin/testimonials');
  } catch (err) {
    res.render('admin/testimonials/form', {
      title: 'New Testimonial | Admin',
      testimonial: req.body,
      error: err.message,
      currentPage: 'testimonials',
    });
  }
});

router.get('/admin/testimonials/:id/edit', async (req, res) => {
  try {
    const testimonial = await Testimonial.findById(req.params.id).lean();
    if (!testimonial) return res.redirect('/admin/testimonials');
    res.render('admin/testimonials/form', {
      title: 'Edit Testimonial | Admin',
      testimonial,
      error: null,
      currentPage: 'testimonials',
    });
  } catch (err) {
    res.redirect('/admin/testimonials');
  }
});

router.put('/admin/testimonials/:id', upload.single('photo'), async (req, res) => {
  try {
    const { name, country, profession, review, rating, verificationUrl, featured, displayOrder, status } = req.body;
    const update = {
      name,
      country: country || '',
      profession: profession || '',
      review,
      rating: Number(rating) || 5,
      verificationUrl: verificationUrl || '',
      featured: featured === 'on' || featured === 'true',
      displayOrder: Number(displayOrder) || 0,
      status: status || 'published',
    };
    if (req.file) update.photo = `/uploads/${req.file.filename}`;
    else if (req.body.photoUrl) update.photo = req.body.photoUrl;

    await Testimonial.findByIdAndUpdate(req.params.id, { $set: update }, { runValidators: true });
    res.redirect('/admin/testimonials');
  } catch (err) {
    const testimonial = await Testimonial.findById(req.params.id).lean();
    res.render('admin/testimonials/form', {
      title: 'Edit Testimonial | Admin',
      testimonial: { ...testimonial, ...req.body },
      error: err.message,
      currentPage: 'testimonials',
    });
  }
});

router.delete('/admin/testimonials/:id', async (req, res) => {
  try {
    await Testimonial.findByIdAndDelete(req.params.id);
    res.redirect('/admin/testimonials');
  } catch (err) {
    res.redirect('/admin/testimonials');
  }
});

// ========================================================================
// FAQS
// ========================================================================

router.get('/admin/faqs', async (req, res) => {
  try {
    const { status, category, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (category && category !== 'all') filter.category = category;

    const total = await FAQ.countDocuments(filter);
    const faqs = await FAQ.find(filter)
      .sort({ displayOrder: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const categories = await FAQ.distinct('category');

    res.render('admin/faqs/index', {
      title: 'FAQs | Admin',
      faqs,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit),
      statusFilter: status || 'all',
      categoryFilter: category || 'all',
      categories,
      currentPage: 'faqs',
    });
  } catch (err) {
    console.error('[admin/faqs]', err.message);
    res.redirect('/admin');
  }
});

router.get('/admin/faqs/new', (req, res) => {
  res.render('admin/faqs/form', {
    title: 'New FAQ | Admin',
    faq: null,
    error: null,
    currentPage: 'faqs',
    serviceSlugs: servicesList.map((s) => s.slug),
  });
});

router.post('/admin/faqs', async (req, res) => {
  try {
    const { question, answer, category, displayOrder, showOnHomepage, showOnServicePage, schemaEnabled, status } = req.body;
    await FAQ.create({
      question,
      answer,
      category: category || 'General',
      displayOrder: Number(displayOrder) || 0,
      showOnHomepage: showOnHomepage === 'on' || showOnHomepage === 'true',
      showOnServicePage: showOnServicePage || '',
      schemaEnabled: schemaEnabled === 'on' || schemaEnabled === 'true',
      status: status || 'published',
    });
    res.redirect('/admin/faqs');
  } catch (err) {
    res.render('admin/faqs/form', {
      title: 'New FAQ | Admin',
      faq: req.body,
      error: err.message,
      currentPage: 'faqs',
      serviceSlugs: servicesList.map((s) => s.slug),
    });
  }
});

router.get('/admin/faqs/:id/edit', async (req, res) => {
  try {
    const faq = await FAQ.findById(req.params.id).lean();
    if (!faq) return res.redirect('/admin/faqs');
    res.render('admin/faqs/form', {
      title: 'Edit FAQ | Admin',
      faq,
      error: null,
      currentPage: 'faqs',
      serviceSlugs: servicesList.map((s) => s.slug),
    });
  } catch (err) {
    res.redirect('/admin/faqs');
  }
});

router.put('/admin/faqs/:id', async (req, res) => {
  try {
    const { question, answer, category, displayOrder, showOnHomepage, showOnServicePage, schemaEnabled, status } = req.body;
    await FAQ.findByIdAndUpdate(req.params.id, {
      $set: {
        question,
        answer,
        category: category || 'General',
        displayOrder: Number(displayOrder) || 0,
        showOnHomepage: showOnHomepage === 'on' || showOnHomepage === 'true',
        showOnServicePage: showOnServicePage || '',
        schemaEnabled: schemaEnabled === 'on' || schemaEnabled === 'true',
        status: status || 'published',
      },
    }, { runValidators: true });
    res.redirect('/admin/faqs');
  } catch (err) {
    const faq = await FAQ.findById(req.params.id).lean();
    res.render('admin/faqs/form', {
      title: 'Edit FAQ | Admin',
      faq: { ...faq, ...req.body },
      error: err.message,
      currentPage: 'faqs',
      serviceSlugs: servicesList.map((s) => s.slug),
    });
  }
});

router.delete('/admin/faqs/:id', async (req, res) => {
  try {
    await FAQ.findByIdAndDelete(req.params.id);
    res.redirect('/admin/faqs');
  } catch (err) {
    res.redirect('/admin/faqs');
  }
});

// ========================================================================
// SERVICES MANAGEMENT
// ========================================================================

router.get('/admin/services', async (req, res) => {
  const seoMetas = await SEOMeta.find({ pageType: 'service' }).lean();
  const seoMap = {};
  seoMetas.forEach((s) => { seoMap[s.pageRef] = s; });

  res.render('admin/services/index', {
    title: 'Services | Admin',
    services: servicesList,
    seoMap,
    currentPage: 'services',
  });
});

// ========================================================================
// MEDIA LIBRARY
// ========================================================================

router.get('/admin/media', async (req, res) => {
  try {
    const { folder = '/', page = 1, limit = 30 } = req.query;
    const filter = {};
    if (folder && folder !== '/') filter.folder = folder;

    const total = await Media.countDocuments(filter);
    const mediaItems = await Media.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const folders = await Media.distinct('folder');

    res.render('admin/media/index', {
      title: 'Media Library | Admin',
      mediaItems,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit),
      currentFolder: folder,
      folders,
      currentPage: 'media',
    });
  } catch (err) {
    console.error('[admin/media]', err.message);
    res.redirect('/admin');
  }
});

router.post('/admin/media/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) throw new Error('No file uploaded');
    const { folder, altText } = req.body;
    await Media.create({
      originalName: req.file.originalname,
      filename: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      url: `/uploads/${req.file.filename}`,
      altText: altText || '',
      folder: folder || '/',
      uploadedBy: req.session.adminUser?.name || 'Admin',
    });
    res.redirect(req.headers.referer || '/admin/media');
  } catch (err) {
    console.error('[admin/media/upload]', err.message);
    res.redirect('/admin/media');
  }
});

router.delete('/admin/media/:id', async (req, res) => {
  try {
    const media = await Media.findById(req.params.id);
    if (media) {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(__dirname, '..', '..', 'public', media.url);
      try { fs.unlinkSync(filePath); } catch (_) { /* file may not exist on disk */ }
      await Media.findByIdAndDelete(req.params.id);
    }
    res.redirect('/admin/media');
  } catch (err) {
    res.redirect('/admin/media');
  }
});

router.post('/admin/media/:id/alt', async (req, res) => {
  try {
    const { altText } = req.body;
    await Media.findByIdAndUpdate(req.params.id, { altText: altText || '' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ========================================================================
// COMPANY SETTINGS
// ========================================================================

router.get('/admin/settings', async (req, res) => {
  try {
    const settings = await Setting.find().lean();
    const grouped = {};
    settings.forEach((s) => {
      if (!grouped[s.group]) grouped[s.group] = {};
      grouped[s.group][s.key] = s.value;
    });

    res.render('admin/settings/index', {
      title: 'Settings | Admin',
      settings: grouped,
      error: null,
      currentPage: 'settings',
    });
  } catch (err) {
    res.render('admin/settings/index', {
      title: 'Settings | Admin',
      settings: {},
      error: err.message,
      currentPage: 'settings',
    });
  }
});

router.post('/admin/settings', async (req, res) => {
  try {
    const { group, ...keys } = req.body;
    if (!group) throw new Error('Group is required');

    for (const [key, value] of Object.entries(keys)) {
      if (key === 'group') continue;
      await Setting.findOneAndUpdate(
        { group, key },
        { value: value || '' },
        { upsert: true }
      );
    }

    res.redirect('/admin/settings');
  } catch (err) {
    console.error('[admin/settings]', err.message);
    res.redirect('/admin/settings');
  }
});

// ========================================================================
// CONTACT FORM SETTINGS (monitoring)
// ========================================================================

router.get('/admin/contact-form', async (req, res) => {
  const integrations = {
    mongodb: {
      status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      label: 'MongoDB',
    },
    googleSheets: {
      status: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY && process.env.GOOGLE_SHEET_ID
        ? 'configured' : 'not configured',
      label: 'Google Sheets',
    },
    gmail: {
      status: process.env.RESEND_API_KEY ? 'configured' : 'not configured',
      label: 'Gmail (Resend)',
    },
  };

  res.render('admin/settings/contact-form', {
    title: 'Contact Form Settings | Admin',
    integrations,
    currentPage: 'settings',
  });
});

// ========================================================================
// USER MANAGEMENT
// ========================================================================

router.get('/admin/users', async (req, res) => {
  // Only super_admin and admin can manage users
  const currentRole = req.session.adminUser?.role || 'super_admin';
  if (!['super_admin', 'admin'].includes(currentRole)) {
    return res.redirect('/admin');
  }

  try {
    const users = await AdminUser.find().select('-password').sort({ createdAt: -1 }).lean();
    res.render('admin/users/index', {
      title: 'Users | Admin',
      users,
      error: null,
      currentPage: 'users',
    });
  } catch (err) {
    res.redirect('/admin');
  }
});

router.get('/admin/users/new', (req, res) => {
  const currentRole = req.session.adminUser?.role || 'super_admin';
  if (!['super_admin', 'admin'].includes(currentRole)) return res.redirect('/admin');
  res.render('admin/users/form', {
    title: 'New User | Admin',
    user: null,
    error: null,
    currentPage: 'users',
  });
});

router.post('/admin/users', async (req, res) => {
  const currentRole = req.session.adminUser?.role || 'super_admin';
  if (!['super_admin', 'admin'].includes(currentRole)) return res.redirect('/admin');

  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      throw new Error('Name, email, and password are required');
    }
    await AdminUser.create({ name, email, password, role: role || 'editor' });
    res.redirect('/admin/users');
  } catch (err) {
    res.render('admin/users/form', {
      title: 'New User | Admin',
      user: req.body,
      error: err.message,
      currentPage: 'users',
    });
  }
});

router.delete('/admin/users/:id', async (req, res) => {
  const currentRole = req.session.adminUser?.role || 'super_admin';
  if (currentRole !== 'super_admin') return res.redirect('/admin/users');
  try {
    await AdminUser.findByIdAndDelete(req.params.id);
    res.redirect('/admin/users');
  } catch (err) {
    res.redirect('/admin/users');
  }
});

// ========================================================================
// GLOBAL SEARCH
// ========================================================================

router.get('/admin/search', async (req, res) => {
  const { q } = req.query;
  if (!q || !q.trim()) return res.redirect('/admin');

  const safe = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  try {
    const [blogs, leads, testimonials, faqs] = await Promise.all([
      BlogPost.find({ title: { $regex: safe, $options: 'i' } })
        .select('title slug published createdAt')
        .limit(10)
        .lean(),
      Consultation.find({
        $or: [
          { name: { $regex: safe, $options: 'i' } },
          { email: { $regex: safe, $options: 'i' } },
        ],
      })
        .select('name email status createdAt')
        .limit(10)
        .lean(),
      Testimonial.find({ name: { $regex: safe, $options: 'i' } })
        .select('name review status')
        .limit(10)
        .lean(),
      FAQ.find({ question: { $regex: safe, $options: 'i' } })
        .select('question category status')
        .limit(10)
        .lean(),
    ]);

    res.render('admin/search', {
      title: 'Search Results | Admin',
      query: q,
      blogs,
      leads,
      testimonials,
      faqs,
      currentPage: null,
    });
  } catch (err) {
    console.error('[admin/search]', err.message);
    res.redirect('/admin');
  }
});

module.exports = router;
