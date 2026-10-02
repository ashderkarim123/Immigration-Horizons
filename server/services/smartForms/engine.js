const {
  FIELD_TYPES,
  CONDITION_OPERATORS,
  ADDRESS_PARTS,
  MAX_TEXT_LENGTH,
  MAX_TEXTAREA_LENGTH,
  MAX_REPEATED_ROWS,
} = require('../../utils/smartFormConstants');

/**
 * Smart Forms engine (ADR-021 §5–§13): template validation, answer
 * normalisation, conditional visibility and progress. Pure functions — no I/O,
 * no dependencies — so the identical logic can be mirrored in
 * src/lib/forms/engine.ts and both copies tested against the same vectors
 * (docs/architecture/smart-form-engine-vectors.json).
 *
 * The server is the only authority: the browser never supplies validation
 * rules, and the condition vocabulary is a closed set of four operators.
 */

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const ALLOWED_VALIDATION = ['minLength', 'maxLength', 'min', 'max', 'integer', 'minItems', 'maxItems'];
// A repeated_group's rows hold scalar-ish fields only: one level of nesting, never a tree.
const CHILD_TYPES = FIELD_TYPES.filter((t) => t !== 'repeated_group' && t !== 'address');

/** `rowPath` is `index` or `index.child`; the public key reads `group[index]` / `group[index].child`. */
const rowErrorPath = (key, rowPath) => {
  const [index, ...rest] = rowPath.split('.');
  return `${key}[${index}]${rest.length ? `.${rest.join('.')}` : ''}`;
};

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// ---------------------------------------------------------------------------
// Template definition validation (run when templates are seeded)
// ---------------------------------------------------------------------------

function validateField(field, path, siblingKeys, topLevel, errors) {
  const where = `${path}${field && field.key ? field.key : '?'}`;
  if (!isPlainObject(field)) return errors.push(`${where}: field must be an object.`);
  if (!KEY_PATTERN.test(field.key || '')) errors.push(`${where}: key must be snake_case (${KEY_PATTERN}).`);
  if (!field.label || typeof field.label !== 'string') errors.push(`${where}: label is required.`);
  if (!FIELD_TYPES.includes(field.type)) return errors.push(`${where}: unsupported type "${field.type}".`);
  if (!topLevel && !CHILD_TYPES.includes(field.type)) errors.push(`${where}: type "${field.type}" is not allowed inside a repeated group.`);

  if (field.staffOnly && field.required) errors.push(`${where}: a staffOnly field cannot be required (clients cannot complete it).`);
  if (field.staffOnly && field.clientEditable) errors.push(`${where}: a staffOnly field cannot be clientEditable.`);

  if (field.type === 'select' || field.type === 'multi_select') {
    const options = field.options;
    if (!Array.isArray(options) || options.length === 0) errors.push(`${where}: options are required.`);
    else {
      const values = options.map((o) => o && o.value);
      if (values.some((v) => typeof v !== 'string' || v === '')) errors.push(`${where}: every option needs a string value.`);
      if (new Set(values).size !== values.length) errors.push(`${where}: duplicate option values.`);
    }
  } else if (field.options !== undefined) {
    errors.push(`${where}: options are only valid on select / multi_select.`);
  }

  for (const key of Object.keys(field.validation || {})) {
    if (!ALLOWED_VALIDATION.includes(key)) errors.push(`${where}: unsupported validation property "${key}".`);
  }

  const condition = field.visibilityCondition;
  if (condition !== undefined) {
    if (!isPlainObject(condition) || !CONDITION_OPERATORS.includes(condition.op)) {
      errors.push(`${where}: visibilityCondition.op must be one of ${CONDITION_OPERATORS.join(', ')}.`);
    } else {
      if (!siblingKeys.includes(condition.field) || condition.field === field.key) {
        errors.push(`${where}: visibilityCondition.field must name another field at the same level.`);
      }
      if ((condition.op === 'equals' || condition.op === 'notEquals') && condition.value === undefined) {
        errors.push(`${where}: visibilityCondition.value is required for ${condition.op}.`);
      }
    }
  }

  if (field.type === 'repeated_group') {
    if (!Array.isArray(field.children) || field.children.length === 0) {
      errors.push(`${where}: a repeated_group needs children.`);
    } else {
      const childKeys = field.children.map((c) => c && c.key);
      if (new Set(childKeys).size !== childKeys.length) errors.push(`${where}: duplicate child keys.`);
      field.children.forEach((child) => validateField(child, `${where}.`, childKeys, false, errors));
    }
  } else if (field.children !== undefined) {
    errors.push(`${where}: children are only valid on repeated_group.`);
  }
}

/** Returns a list of problems; an empty list means the definition is safe to publish. */
function validateTemplateDefinition(definition) {
  const errors = [];
  if (!isPlainObject(definition)) return ['Template must be an object.'];
  if (!KEY_PATTERN.test(definition.key || '')) errors.push('Template key must be snake_case.');
  if (!Number.isInteger(definition.version) || definition.version < 1) errors.push('Template version must be a positive integer.');
  if (!definition.title) errors.push('Template title is required.');
  if (!Array.isArray(definition.sections) || definition.sections.length === 0) return [...errors, 'A template needs at least one section.'];

  const topKeys = definition.sections.flatMap((s) => (Array.isArray(s && s.fields) ? s.fields.map((f) => f && f.key) : []));
  const seen = new Set();
  for (const key of topKeys) {
    if (seen.has(key)) errors.push(`Duplicate field key "${key}" in template "${definition.key}".`);
    seen.add(key);
  }
  const sectionKeys = definition.sections.map((s) => s && s.key);
  if (new Set(sectionKeys).size !== sectionKeys.length) errors.push('Duplicate section keys.');

  for (const section of definition.sections) {
    if (!isPlainObject(section) || !KEY_PATTERN.test(section.key || '') || !section.title || !Array.isArray(section.fields) || section.fields.length === 0) {
      errors.push(`Section "${section && section.key}" needs a snake_case key, a title and fields.`);
      continue;
    }
    // A condition may reference any top-level field in the template, not only its own section.
    section.fields.forEach((field) => validateField(field, '', topKeys, true, errors));
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

function isTruthyAnswer(value) {
  if (value === undefined || value === null || value === false || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function equalsAnswer(actual, expected) {
  if (Array.isArray(actual)) return actual.includes(expected);
  return actual === expected;
}

/** `scope` is the answers object (top-level fields) or one row (group children). */
function isVisible(field, scope) {
  const condition = field.visibilityCondition;
  if (!condition) return true;
  const actual = scope ? scope[condition.field] : undefined;
  switch (condition.op) {
    case 'equals':
      return equalsAnswer(actual, condition.value);
    case 'notEquals':
      return !equalsAnswer(actual, condition.value);
    case 'isTruthy':
      return isTruthyAnswer(actual);
    case 'isFalsy':
      return !isTruthyAnswer(actual);
    default:
      return false; // an unknown operator can never reveal a field
  }
}

// ---------------------------------------------------------------------------
// Value normalisation
// ---------------------------------------------------------------------------

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function isRealDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

function limitFor(field, fallback) {
  const max = field.validation && field.validation.maxLength;
  return Number.isInteger(max) ? Math.min(max, fallback) : fallback;
}

/**
 * Normalises one raw value for `field`. `strict` adds the format and range
 * checks that only make sense on a finished answer (email shape, number
 * bounds, minimum length); autosave runs non-strict so a half-typed email is
 * stored rather than rejected on every keystroke.
 * Returns `{ value }` — `undefined` meaning "empty / clear" — or `{ error }`.
 */
function normalizeValue(field, raw, strict) {
  const empty = raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0 && field.type !== 'repeated_group');
  if (empty && field.type !== 'yes_no' && field.type !== 'repeated_group') return { value: undefined };

  switch (field.type) {
    case 'text':
    case 'textarea':
    case 'email':
    case 'phone': {
      if (typeof raw !== 'string') return { error: 'Enter text.' };
      const text = raw.replace(/\r\n/g, '\n').trim();
      if (!text) return { value: undefined };
      const cap = limitFor(field, field.type === 'textarea' ? MAX_TEXTAREA_LENGTH : MAX_TEXT_LENGTH);
      if (text.length > cap) return { error: `Use at most ${cap} characters.` };
      if (strict) {
        const min = field.validation && field.validation.minLength;
        if (Number.isInteger(min) && text.length < min) return { error: `Use at least ${min} characters.` };
        if (field.type === 'email' && !EMAIL_PATTERN.test(text)) return { error: 'Enter a valid email address.' };
        if (field.type === 'phone' && !(/^[+()\-.\s\d]{7,25}$/.test(text) && text.replace(/\D/g, '').length >= 7)) {
          return { error: 'Enter a valid phone number.' };
        }
      }
      return { value: text };
    }
    case 'number': {
      const number = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
      if (!Number.isFinite(number)) return { error: 'Enter a number.' };
      const rules = field.validation || {};
      if (strict) {
        if (rules.integer && !Number.isInteger(number)) return { error: 'Enter a whole number.' };
        if (typeof rules.min === 'number' && number < rules.min) return { error: `Enter ${rules.min} or more.` };
        if (typeof rules.max === 'number' && number > rules.max) return { error: `Enter ${rules.max} or less.` };
      }
      return { value: number };
    }
    case 'date':
      return typeof raw === 'string' && isRealDate(raw.trim()) ? { value: raw.trim() } : { error: 'Enter a valid date.' };
    case 'yes_no': {
      if (raw === true || raw === 'true' || raw === 'yes') return { value: true };
      if (raw === false || raw === 'false' || raw === 'no') return { value: false };
      return raw === undefined || raw === null || raw === '' ? { value: undefined } : { error: 'Choose yes or no.' };
    }
    case 'select': {
      const values = (field.options || []).map((o) => o.value);
      return typeof raw === 'string' && values.includes(raw) ? { value: raw } : { error: 'Choose one of the listed options.' };
    }
    case 'multi_select': {
      const values = (field.options || []).map((o) => o.value);
      if (!Array.isArray(raw) || raw.some((v) => typeof v !== 'string' || !values.includes(v))) return { error: 'Choose only listed options.' };
      const unique = [...new Set(raw)];
      const rules = field.validation || {};
      if (typeof rules.maxItems === 'number' && unique.length > rules.maxItems) return { error: `Choose at most ${rules.maxItems}.` };
      return { value: unique };
    }
    case 'country': {
      const code = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
      return /^[A-Z]{2}$/.test(code) ? { value: code } : { error: 'Choose a country.' };
    }
    case 'address': {
      if (!isPlainObject(raw)) return { error: 'Enter an address.' };
      const unknown = Object.keys(raw).find((k) => !ADDRESS_PARTS.includes(k));
      if (unknown) return { error: `Unknown address part "${unknown}".` };
      const address = {};
      for (const part of ADDRESS_PARTS) {
        const piece = raw[part];
        if (piece === undefined || piece === null || piece === '') continue;
        if (typeof piece !== 'string') return { error: 'Enter text in each address line.' };
        const text = piece.trim();
        if (!text) continue;
        if (text.length > 200) return { error: 'Use at most 200 characters in each address line.' };
        if (part === 'country' && !/^[A-Za-z]{2}$/.test(text)) return { error: 'Choose a country.' };
        address[part] = part === 'country' ? text.toUpperCase() : text;
      }
      return Object.keys(address).length ? { value: address } : { value: undefined };
    }
    case 'repeated_group': {
      if (raw === undefined || raw === null) return { value: undefined };
      if (!Array.isArray(raw)) return { error: 'Enter a list of entries.' };
      const rules = field.validation || {};
      const maxRows = Math.min(typeof rules.maxItems === 'number' ? rules.maxItems : MAX_REPEATED_ROWS, MAX_REPEATED_ROWS);
      if (raw.length > maxRows) return { error: `Add at most ${maxRows} entries.` };
      const rows = [];
      const rowErrors = {};
      raw.forEach((row, index) => {
        if (!isPlainObject(row)) {
          rowErrors[`${index}`] = 'Each entry must be an object.';
          return;
        }
        const normalized = {};
        for (const key of Object.keys(row)) {
          const child = (field.children || []).find((c) => c.key === key);
          if (!child) {
            rowErrors[`${index}.${key}`] = 'Unknown field.';
            continue;
          }
          const result = normalizeValue(child, row[key], strict);
          if (result.error) rowErrors[`${index}.${key}`] = result.error;
          else if (result.value !== undefined) normalized[key] = result.value;
        }
        rows.push(normalized);
      });
      return Object.keys(rowErrors).length ? { error: 'Check the highlighted entries.', rowErrors } : { value: rows };
    }
    default:
      return { error: 'Unsupported field type.' };
  }
}

// ---------------------------------------------------------------------------
// Template traversal helpers
// ---------------------------------------------------------------------------

function topLevelFields(template) {
  return template.sections.flatMap((section) => section.fields);
}

function findField(template, key) {
  return topLevelFields(template).find((field) => field.key === key) || null;
}

function isClientWritable(field) {
  return !field.staffOnly && field.clientEditable !== false;
}

/** Which top-level keys `actor` ('client' | 'employee') may write. */
function writableKeys(template, actor) {
  return topLevelFields(template)
    .filter((field) => (actor === 'client' ? isClientWritable(field) : true))
    .map((field) => field.key);
}

/** Template sections as a client may see them: staff-only fields (and any section left empty) removed. */
function sectionsForAudience(template, audience) {
  if (audience !== 'client') return template.sections;
  return template.sections
    .map((section) => ({ ...section, fields: section.fields.filter((field) => !field.staffOnly) }))
    .filter((section) => section.fields.length > 0);
}

// ---------------------------------------------------------------------------
// Patches (autosave)
// ---------------------------------------------------------------------------

/**
 * Validates and normalises an answer patch for `actor`. Unknown keys and keys
 * the actor may not write are errors, never silently dropped. Returns
 * `{ values, errors }`; `values[key] === undefined` means "clear this answer".
 */
function normalizePatch(template, patch, actor) {
  const values = {};
  const errors = {};
  if (!isPlainObject(patch)) return { values, errors: { _form: 'Answers must be an object.' } };

  const writable = new Set(writableKeys(template, actor));
  for (const key of Object.keys(patch)) {
    const field = findField(template, key);
    if (!field) {
      errors[key] = 'Unknown field.';
    } else if (!writable.has(key)) {
      errors[key] = 'This field cannot be edited.';
    } else {
      const result = normalizeValue(field, patch[key], false);
      if (result.error) {
        errors[key] = result.error;
        for (const [rowPath, message] of Object.entries(result.rowErrors || {})) errors[rowErrorPath(key, rowPath)] = message;
      } else values[key] = result.value;
    }
  }
  return { values, errors };
}

// ---------------------------------------------------------------------------
// Full validation (submit / approve) and progress
// ---------------------------------------------------------------------------

function isCompleteAddress(address) {
  return !!(address && address.line1 && address.city && address.country);
}

/** One top-level field against a finished answer set. Returns an error string or ''. */
function fieldProblem(field, answers, errors) {
  const raw = answers[field.key];
  const result = normalizeValue(field, raw, true);
  if (result.error) {
    for (const [rowPath, message] of Object.entries(result.rowErrors || {})) errors[rowErrorPath(field.key, rowPath)] = message;
    return result.error;
  }
  const value = result.value;
  if (!field.required) return '';

  if (field.type === 'repeated_group') {
    const rows = value || [];
    const min = Math.max(1, (field.validation && field.validation.minItems) || 1);
    if (rows.length < min) return min === 1 ? 'Add at least one entry.' : `Add at least ${min} entries.`;
    let rowsOk = true;
    rows.forEach((row, index) => {
      for (const child of field.children) {
        if (!isVisible(child, row)) continue;
        const childResult = normalizeValue(child, row[child.key], true);
        if (childResult.error) {
          errors[`${field.key}[${index}].${child.key}`] = childResult.error;
          rowsOk = false;
        } else if (child.required && childResult.value === undefined) {
          errors[`${field.key}[${index}].${child.key}`] = 'This field is required.';
          rowsOk = false;
        }
      }
    });
    return rowsOk ? '' : 'Complete every entry.';
  }
  if (field.type === 'address') return isCompleteAddress(value) ? '' : 'Enter the street, city and country.';
  return value === undefined ? 'This field is required.' : '';
}

/** Rows of a NON-required group are still validated for shape/format when present. */
function optionalGroupRowProblems(field, answers, errors) {
  const rows = (normalizeValue(field, answers[field.key], true).value || []);
  rows.forEach((row, index) => {
    for (const child of field.children) {
      if (!isVisible(child, row)) continue;
      if (child.required && normalizeValue(child, row[child.key], true).value === undefined) {
        errors[`${field.key}[${index}].${child.key}`] = 'This field is required.';
      }
    }
  });
}

/** Authoritative validation of a finished form. Staff-only fields never block a client submission. */
function validateForSubmit(template, answers) {
  const source = isPlainObject(answers) ? answers : {};
  const errors = {};
  for (const field of topLevelFields(template)) {
    if (!isVisible(field, source)) continue;
    const message = fieldProblem(field, source, errors);
    if (message) errors[field.key] = message;
    else if (field.type === 'repeated_group' && !field.required) optionalGroupRowProblems(field, source, errors);
  }
  return errors;
}

/** completed required, currently-visible, client-completable fields / total of the same. An intake metric only. */
function computeProgress(template, answers) {
  const source = isPlainObject(answers) ? answers : {};
  let total = 0;
  let completed = 0;
  for (const field of topLevelFields(template)) {
    if (!field.required || field.staffOnly || !isVisible(field, source)) continue;
    total += 1;
    if (!fieldProblem(field, source, {})) completed += 1;
  }
  return { completedRequired: completed, totalRequired: total, percent: total === 0 ? 100 : Math.floor((completed / total) * 100) };
}

module.exports = {
  validateTemplateDefinition,
  isVisible,
  normalizeValue,
  normalizePatch,
  writableKeys,
  sectionsForAudience,
  validateForSubmit,
  computeProgress,
  findField,
  topLevelFields,
};
