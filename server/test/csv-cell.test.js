const test = require('node:test');
const assert = require('node:assert/strict');

const { csvCell } = require('../utils/csv');

test('csvCell(): null and undefined become an empty quoted string', () => {
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(undefined), '""');
});

test('csvCell(): plain values are wrapped in quotes, unmodified', () => {
  assert.equal(csvCell('Jane Doe'), '"Jane Doe"');
  assert.equal(csvCell('jane@example.com'), '"jane@example.com"');
});

test('csvCell(): embedded double quotes are doubled per CSV escaping rules', () => {
  assert.equal(csvCell('She said "hello"'), '"She said ""hello"""');
});

test('csvCell(): values starting with = + - @ are neutralized with a leading quote', () => {
  assert.equal(csvCell('=HYPERLINK("http://evil","click")'), `"'=HYPERLINK(""http://evil"",""click"")"`);
  assert.equal(csvCell('+1234'), `"'+1234"`);
  assert.equal(csvCell('-1234'), `"'-1234"`);
  assert.equal(csvCell('@SUM(A1:A9)'), `"'@SUM(A1:A9)"`);
});

test('csvCell(): a leading tab or carriage return is also neutralized', () => {
  assert.equal(csvCell('\t=cmd|/c calc'), `"'\t=cmd|/c calc"`);
  assert.equal(csvCell('\rmalicious'), `"'\rmalicious"`);
});

test('csvCell(): a formula character NOT in the leading position is left untouched', () => {
  assert.equal(csvCell('total = 5'), '"total = 5"');
  assert.equal(csvCell('email+tag@example.com'), '"email+tag@example.com"');
});

test('csvCell(): numbers and other non-string types are stringified safely', () => {
  assert.equal(csvCell(42), '"42"');
  assert.equal(csvCell(true), '"true"');
});
