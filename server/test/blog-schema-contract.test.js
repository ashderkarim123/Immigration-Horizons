const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const contract = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/architecture/blog-schema-contract.json'), 'utf8'));
const BlogPost = require('../models/BlogPost');
const categories = require('../utils/blogCategories');

test('admin BlogPost model matches the shared schema contract', () => {
  assert.equal(BlogPost.collection.collectionName, contract.collection);
  assert.deepEqual(categories, contract.categories);
  for (const field of contract.requiredFields) {
    assert.ok(BlogPost.schema.path(field), `BlogPost.${field} must exist`);
  }
});
