import { test } from "node:test";
import assert from "node:assert/strict";

import contract from "../docs/architecture/blog-schema-contract.json" with { type: "json" };
import { BLOG_CATEGORIES, BlogPost } from "../src/lib/models/BlogPost";

test("public BlogPost mirror matches the shared schema contract", () => {
  assert.equal(BlogPost.collection.collectionName, contract.collection);
  assert.deepEqual([...BLOG_CATEGORIES], contract.categories);
  for (const field of contract.requiredFields) {
    assert.ok(BlogPost.schema.path(field), `BlogPost.${field} must exist`);
  }
});
