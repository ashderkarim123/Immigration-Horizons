const mongoose = require('mongoose');

const SEOMetaSchema = new mongoose.Schema(
  {
    // Which page this SEO belongs to (e.g. 'home', 'about', 'contact', 'services', 'blog', or a service slug, or post._id)
    pageRef: { type: String, required: true, unique: true, index: true },
    pageType: {
      type: String,
      enum: ['static', 'service', 'blog', 'landing', 'custom'],
      default: 'static',
    },
    seoTitle: { type: String, default: '' },
    metaDescription: { type: String, default: '' },
    keywords: { type: String, default: '' },
    canonicalUrl: { type: String, default: '' },
    ogTitle: { type: String, default: '' },
    ogDescription: { type: String, default: '' },
    ogImage: { type: String, default: '' },
    twitterImage: { type: String, default: '' },
    slug: { type: String, default: '' },
    robots: { type: String, default: 'index,follow' },
    noindex: { type: Boolean, default: false },
    schemaType: { type: String, default: 'WebPage' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SEOMeta', SEOMetaSchema);
