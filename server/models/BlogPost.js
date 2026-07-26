const mongoose = require('mongoose');
const slugify = require('slugify');
const blogCategories = require('../utils/blogCategories');

const BlogPostSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true },
    category: {
      type: String,
      enum: blogCategories,
      default: 'Immigration Tips',
    },
    excerpt: { type: String, required: true, trim: true, maxlength: 300 },
    content: { type: String, required: true }, // HTML from the admin editor
    coverImage: { type: String, default: '' }, // /uploads/xyz.jpg or external URL
    author: { type: String, default: 'Immigration Horizons Team' },
    tags: { type: [String], default: [] },
    readingTime: { type: Number, default: 0 }, // minutes
    published: { type: Boolean, default: true },
    publishDate: { type: Date, default: null },
  },
  { timestamps: true }
);

// Mongoose 7+ dropped callback-style middleware — a synchronous hook takes
// no `next` parameter and must not call one. (Pre-existing bug: leaving the
// slug field blank when creating a post threw "next is not a function"
// instead of auto-generating the slug.)
BlogPostSchema.pre('validate', function () {
  if (this.title && !this.slug) {
    this.slug = slugify(this.title, { lower: true, strict: true });
  }
});

module.exports = mongoose.model('BlogPost', BlogPostSchema);
