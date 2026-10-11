/**
 * Write-time allowlist sanitizer for Blog HTML (ADR-029). The public site already sanitizes at render
 * (src/components/blog/blog-content.tsx); this is the same allowlist applied where the content is stored, so a script
 * never reaches the database through either console. Both sides assert the lists against
 * docs/architecture/blog-schema-contract.json. Existing posts are not rewritten — only what is saved from now on.
 */
const sanitizeHtml = require('sanitize-html');

const BLOG_HTML_ALLOWED_TAGS = ['p', 'br', 'h2', 'h3', 'h4', 'strong', 'em', 'b', 'i', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'hr'];
const BLOG_HTML_ALLOWED_ATTRIBUTES = { a: ['href', 'title', 'target', 'rel'], img: ['src', 'alt', 'title', 'width', 'height'] };
const BLOG_HTML_ALLOWED_SCHEMES = ['http', 'https', 'mailto'];

function sanitizeBlogContent(html) {
  return sanitizeHtml(String(html || ''), {
    allowedTags: BLOG_HTML_ALLOWED_TAGS,
    allowedAttributes: BLOG_HTML_ALLOWED_ATTRIBUTES,
    allowedSchemes: BLOG_HTML_ALLOWED_SCHEMES,
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowProtocolRelative: false,
    // A link that opens a new tab must not hand the opener to the destination.
    transformTags: { a: (tagName, attribs) => ({ tagName, attribs: attribs.target === '_blank' ? { ...attribs, rel: 'noopener noreferrer' } : attribs }) },
  }).trim();
}

/** True when the sanitized body still says or shows something. */
const hasVisibleContent = (html) => /<img\b/i.test(html) || sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).trim().length > 0;

module.exports = { sanitizeBlogContent, hasVisibleContent, BLOG_HTML_ALLOWED_TAGS, BLOG_HTML_ALLOWED_ATTRIBUTES, BLOG_HTML_ALLOWED_SCHEMES };
