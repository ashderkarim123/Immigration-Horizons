const assert = require('node:assert/strict');
const { test } = require('node:test');
const Consultation = require('../models/Consultation');
const services = require('../utils/services');

test('every mirrored service validates as a consultation, including the six appended values', () => {
  assert.equal(services.length, 16);
  for (const service of services) {
    const lead = new Consultation({ name: 'Catalogue Test', email: 'catalogue@example.com', message: 'Document preparation enquiry', service: service.enumValue });
    assert.equal(lead.validateSync(), undefined, service.slug);
  }
});
