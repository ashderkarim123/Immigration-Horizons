import { test } from "node:test";
import assert from "node:assert/strict";

import contract from "../docs/architecture/blog-schema-contract.json" with { type: "json" };
import {
  BLOG_HTML_ALLOWED_ATTRIBUTES,
  BLOG_HTML_ALLOWED_SCHEMES,
  BLOG_HTML_ALLOWED_TAGS,
  sanitizeBlogHtml,
} from "../src/components/blog/blog-content";

test("the public renderer's allowlist is the contract the CMS also sanitizes against on save", () => {
  assert.deepEqual(BLOG_HTML_ALLOWED_TAGS, contract.allowedHtml.tags);
  assert.deepEqual(BLOG_HTML_ALLOWED_ATTRIBUTES, contract.allowedHtml.attributes);
  assert.deepEqual(BLOG_HTML_ALLOWED_SCHEMES, contract.allowedHtml.schemes);
});

test("a hostile post written before save-time sanitizing existed is still neutralised when rendered", () => {
  const html = sanitizeBlogHtml(
    '<p onmouseover="x()">Text</p><iframe src="https://evil.example"></iframe><style>p{}</style>' +
      '<form action="/x"><input name="q"></form><svg onload="alert(1)"></svg><img src="data:image/svg+xml;base64,AA">',
  );
  assert.equal(html.includes("<p>Text</p>"), true);
  assert.doesNotMatch(html, /onmouseover|<iframe|<style|<form|<input|<svg|data:/);
});

test("CMS blog HTML keeps useful markup but removes executable content", () => {
  const html = sanitizeBlogHtml(
    '<h2>Heading</h2><p><a href="https://example.com" target="_blank">Read</a></p>' +
      '<img src="/uploads/cover.jpg" onerror="alert(1)"><script>alert(1)</script>',
  );

  assert.match(html, /<h2>Heading<\/h2>/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /https:\/\/admin\.immigrationhorizons\.com\/uploads\/cover\.jpg/);
  assert.doesNotMatch(html, /onerror|<script|alert\(1\)/);
});

test("CMS blog HTML rejects javascript links", () => {
  const html = sanitizeBlogHtml('<a href="javascript:alert(1)">Unsafe</a>');
  assert.doesNotMatch(html, /javascript:|alert\(1\)/);
});
