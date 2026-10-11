/**
 * Site settings (ADR-029): the one implementation behind the EJS Settings page and /api/v1/admin/settings.
 *
 * The `Setting` model is a generic key/value store, so THIS registry is the allowlist: only the groups and keys named
 * here can be read or written, each with a type and a length. Nothing in it is a secret — credentials live in the
 * environment and are reported only as "configured or not" by services/integrationStatus.js. The model's `email`
 * group has no supported keys and is deliberately not exposed.
 */
const Setting = require('../../models/admin/Setting');
const { recordSecurityEvent } = require('../../utils/securityEvents');
const { invalid, notFound, normalize } = require('./common');

// Analytics identifiers end up inside script tags on the public site: letters, digits and a few separators only.
const IDENTIFIER = /^[A-Za-z0-9_.=-]*$/;

const GROUPS = [
  {
    group: 'general', title: 'Company', description: 'Contact details shown on the public website.',
    fields: [
      { key: 'companyName', label: 'Company name', type: 'text', maxLength: 120 },
      { key: 'phone', label: 'Phone', type: 'text', maxLength: 40 },
      { key: 'email', label: 'Email', type: 'email', maxLength: 254 },
      { key: 'whatsapp1', label: 'WhatsApp 1', type: 'text', maxLength: 40 },
      { key: 'whatsapp2', label: 'WhatsApp 2', type: 'text', maxLength: 40 },
      { key: 'address', label: 'Address', type: 'text', maxLength: 300 },
    ],
  },
  {
    group: 'social', title: 'Social media', description: 'Public profile links.',
    fields: ['Facebook', 'Instagram', 'LinkedIn', 'YouTube'].map((name) => ({ key: name.toLowerCase(), label: name, type: 'url', maxLength: 300 }))
      .concat({ key: 'x', label: 'X (Twitter)', type: 'url', maxLength: 300 }),
  },
  {
    group: 'analytics', title: 'Analytics', description: 'Public measurement identifiers. These are IDs, not credentials.',
    fields: [
      { key: 'ga4Id', label: 'Google Analytics ID', type: 'text', maxLength: 40, pattern: IDENTIFIER },
      { key: 'gtmId', label: 'Google Tag Manager ID', type: 'text', maxLength: 40, pattern: IDENTIFIER },
      { key: 'metaPixelId', label: 'Meta Pixel ID', type: 'text', maxLength: 40, pattern: IDENTIFIER },
      { key: 'searchConsole', label: 'Search Console verification', type: 'text', maxLength: 120, pattern: IDENTIFIER },
    ],
  },
  {
    group: 'seo_defaults', title: 'SEO defaults', description: 'Used when a page has no SEO metadata of its own.',
    fields: [
      { key: 'metaTitle', label: 'Default meta title', type: 'text', maxLength: 200 },
      { key: 'metaDescription', label: 'Default meta description', type: 'text', maxLength: 500 },
      { key: 'organizationName', label: 'Organization name', type: 'text', maxLength: 120 },
      { key: 'organizationLogo', label: 'Organization logo URL', type: 'url', maxLength: 500, relative: true },
      { key: 'ogImage', label: 'Default Open Graph image URL', type: 'url', maxLength: 500, relative: true },
    ],
  },
  {
    group: 'contact_form', title: 'Contact form', description: 'Addresses that receive website enquiries. Mail credentials are not stored here.',
    fields: [
      { key: 'smtpEmail', label: 'Notification email', type: 'email', maxLength: 254 },
      { key: 'gmailAddress', label: 'Gmail address', type: 'email', maxLength: 254 },
    ],
  },
];
const byGroup = new Map(GROUPS.map((group) => [group.group, group]));

/** Every supported group with its fields and current values. A stored key outside the registry is never returned. */
async function list() {
  const stored = await Setting.find({ group: { $in: [...byGroup.keys()] } }).lean();
  const value = (group, key) => {
    const row = stored.find((setting) => setting.group === group && setting.key === key);
    return row && typeof row.value === 'string' ? row.value : '';
  };
  return GROUPS.map(({ group, title, description, fields }) => ({
    group, title, description,
    fields: fields.map(({ key, label, type, maxLength }) => ({ key, label, type, maxLength, value: value(group, key) })),
  }));
}

/**
 * Saves the supplied keys of one group (keys not supplied are left as they are). An unknown group is a 404; an
 * unknown key is a validation error, never silently stored.
 */
async function saveGroup(ctx, groupName, input) {
  const group = byGroup.get(groupName);
  if (!group) throw notFound('Settings group');
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};

  const errors = {};
  for (const key of Object.keys(source)) if (!group.fields.some((field) => field.key === key)) errors[key] = `"${key}" is not a setting in this group.`;
  const spec = Object.fromEntries(group.fields.map((field) => [field.key, { type: field.type, label: field.label, max: field.maxLength, relative: field.relative }]));
  const { values, errors: fieldErrors } = normalize(spec, source, { partial: true });
  Object.assign(errors, fieldErrors);
  for (const field of group.fields) {
    if (field.pattern && values[field.key] && !field.pattern.test(values[field.key])) errors[field.key] = `${field.label} may contain only letters, numbers, hyphens, underscores, dots and equals signs.`;
  }
  if (Object.keys(errors).length) throw invalid(errors);

  const keys = Object.keys(values);
  await Promise.all(keys.map((key) => Setting.updateOne({ group: group.group, key }, { $set: { value: values[key] } }, { upsert: true })));
  if (keys.length) {
    // Which keys changed, never their values.
    await recordSecurityEvent({ type: 'admin_settings_updated', result: 'success', surface: 'admin_cms', req: ctx.req, ...ctx.actor, meta: { group: group.group, keys } });
  }
  return (await list()).find((entry) => entry.group === group.group);
}

module.exports = { list, saveGroup, GROUPS };
