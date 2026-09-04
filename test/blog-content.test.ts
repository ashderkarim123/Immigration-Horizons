import { test } from "node:test";
import assert from "node:assert/strict";

import { sanitizeBlogHtml } from "../src/components/blog/blog-content";

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
