const test = require('node:test');
const assert = require('node:assert/strict');
const { isChecked } = require('../utils/checkbox');

test('isChecked accepts a checked hidden-field and checkbox pair', () => {
  assert.equal(isChecked(['false', 'true']), true);
});

test('isChecked accepts unchecked and checked single values', () => {
  assert.equal(isChecked('false'), false);
  assert.equal(isChecked(undefined), false);
  assert.equal(isChecked('true'), true);
  assert.equal(isChecked('on'), true);
});
