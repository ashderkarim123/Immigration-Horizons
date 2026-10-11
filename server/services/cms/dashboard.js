/**
 * Website/platform administration dashboard (ADR-029): real counts from the authoritative collections. A figure the
 * actor may not see is `null` ("not available to you"), never a fake zero. No case-work metrics — those are Staff's.
 */
const BlogPost = require('../../models/BlogPost');
const FAQ = require('../../models/admin/FAQ');
const Testimonial = require('../../models/admin/Testimonial');
const Media = require('../../models/admin/Media');
const SEOMeta = require('../../models/admin/SEOMeta');
const AdminUser = require('../../models/admin/User');
const blog = require('./blog');
const securityEvents = require('../securityEventViewer');

async function overview({ canManageUsers, canViewSecurity, canManageBlog }) {
  const [posts, published, faqs, publishedFaqs, testimonials, publishedTestimonials, media, seo, activeUsers, recentPosts, recentEvents] = await Promise.all([
    BlogPost.countDocuments(),
    BlogPost.countDocuments({ published: true }),
    FAQ.countDocuments(),
    FAQ.countDocuments({ status: 'published' }),
    Testimonial.countDocuments(),
    Testimonial.countDocuments({ status: 'published' }),
    Media.countDocuments(),
    SEOMeta.countDocuments(),
    canManageUsers ? AdminUser.countDocuments({ isActive: true }) : null,
    BlogPost.find().select('-content').sort({ updatedAt: -1, _id: -1 }).limit(5).lean(),
    canViewSecurity ? securityEvents.recent(5) : null,
  ]);
  return {
    blog: { total: posts, published, drafts: posts - published },
    faqs: { total: faqs, published: publishedFaqs },
    testimonials: { total: testimonials, published: publishedTestimonials },
    media: { total: media },
    seo: { configuredPages: seo },
    users: activeUsers === null ? null : { active: activeUsers },
    recentPosts: recentPosts.map((post) => blog.toDto(post, { canManage: canManageBlog, withContent: false })),
    recentSecurityEvents: recentEvents,
    asOf: new Date(),
  };
}

module.exports = { overview };
