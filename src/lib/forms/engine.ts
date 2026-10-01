import {
  ADDRESS_PARTS,
  MAX_REPEATED_ROWS,
  MAX_TEXT_LENGTH,
  MAX_TEXTAREA_LENGTH,
  type ConditionOperator,
  type FieldType,
} from "../content/smart-form-constants";

/**
 * Mirrors server/services/smartForms/engine.js (ADR-021 §5–§13) — pure
 * functions, no I/O, imported by both the portal route handlers and the
 * client-side editor (which uses `isVisible` for show/hide only; the server is
 * the sole authority on validation). Both copies are asserted against
 * docs/architecture/smart-form-engine-vectors.json.
 */

export type FormCondition = { field: string; op: ConditionOperator; value?: unknown };
export type FormOption = { value: string; label: string };
export type FormField = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  staffOnly?: boolean;
  clientEditable?: boolean;
  helpText?: string;
  options?: FormOption[];
  children?: FormField[];
  validation?: { minLength?: number; maxLength?: number; min?: number; max?: number; integer?: boolean; minItems?: number; maxItems?: number };
  visibilityCondition?: FormCondition;
};
export type FormSection = { key: string; title: string; fields: FormField[] };
export type FormTemplateShape = { sections: FormSection[] };
export type Answers = Record<string, unknown>;
export type FieldErrors = Record<string, string>;
export type NormalizeResult = { value?: unknown; error?: string; rowErrors?: Record<string, string> };
export type Progress = { completedRequired: number; totalRequired: number; percent: number };

const isPlainObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** `rowPath` is `index` or `index.child`; the public key reads `group[index]` / `group[index].child`. */
const rowErrorPath = (key: string, rowPath: string): string => {
  const [index, ...rest] = rowPath.split(".");
  return `${key}[${index}]${rest.length ? `.${rest.join(".")}` : ""}`;
};

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

function isTruthyAnswer(value: unknown): boolean {
  if (value === undefined || value === null || value === false || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function equalsAnswer(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(actual)) return actual.includes(expected);
  return actual === expected;
}

/** `scope` is the answers object (top-level fields) or one row (group children). */
export function isVisible(field: Pick<FormField, "visibilityCondition">, scope: Answers | undefined | null): boolean {
  const condition = field.visibilityCondition;
  if (!condition) return true;
  const actual = scope ? scope[condition.field] : undefined;
  switch (condition.op) {
    case "equals":
      return equalsAnswer(actual, condition.value);
    case "notEquals":
      return !equalsAnswer(actual, condition.value);
    case "isTruthy":
      return isTruthyAnswer(actual);
    case "isFalsy":
      return !isTruthyAnswer(actual);
    default:
      return false; // an unknown operator can never reveal a field
  }
}

// ---------------------------------------------------------------------------
// Value normalisation
// ---------------------------------------------------------------------------

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function isRealDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

function limitFor(field: FormField, fallback: number): number {
  const max = field.validation?.maxLength;
  return Number.isInteger(max) ? Math.min(max as number, fallback) : fallback;
}

/**
 * Normalises one raw value for `field`. `strict` adds the format and range
 * checks that only make sense on a finished answer; autosave runs non-strict
 * so a half-typed email is stored rather than rejected on every keystroke.
 * Returns `{ value }` (`undefined` meaning "empty / clear") or `{ error }`.
 */
export function normalizeValue(field: FormField, raw: unknown, strict: boolean): NormalizeResult {
  const empty = raw === undefined || raw === null || raw === "" || (Array.isArray(raw) && raw.length === 0 && field.type !== "repeated_group");
  if (empty && field.type !== "yes_no" && field.type !== "repeated_group") return { value: undefined };

  switch (field.type) {
    case "text":
    case "textarea":
    case "email":
    case "phone": {
      if (typeof raw !== "string") return { error: "Enter text." };
      const text = raw.replace(/\r\n/g, "\n").trim();
      if (!text) return { value: undefined };
      const cap = limitFor(field, field.type === "textarea" ? MAX_TEXTAREA_LENGTH : MAX_TEXT_LENGTH);
      if (text.length > cap) return { error: `Use at most ${cap} characters.` };
      if (strict) {
        const min = field.validation?.minLength;
        if (Number.isInteger(min) && text.length < (min as number)) return { error: `Use at least ${min} characters.` };
        if (field.type === "email" && !EMAIL_PATTERN.test(text)) return { error: "Enter a valid email address." };
        if (field.type === "phone" && !(/^[+()\-.\s\d]{7,25}$/.test(text) && text.replace(/\D/g, "").length >= 7)) {
          return { error: "Enter a valid phone number." };
        }
      }
      return { value: text };
    }
    case "number": {
      const number = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
      if (!Number.isFinite(number)) return { error: "Enter a number." };
      const rules = field.validation ?? {};
      if (strict) {
        if (rules.integer && !Number.isInteger(number)) return { error: "Enter a whole number." };
        if (typeof rules.min === "number" && number < rules.min) return { error: `Enter ${rules.min} or more.` };
        if (typeof rules.max === "number" && number > rules.max) return { error: `Enter ${rules.max} or less.` };
      }
      return { value: number };
    }
    case "date":
      return typeof raw === "string" && isRealDate(raw.trim()) ? { value: raw.trim() } : { error: "Enter a valid date." };
    case "yes_no": {
      if (raw === true || raw === "true" || raw === "yes") return { value: true };
      if (raw === false || raw === "false" || raw === "no") return { value: false };
      return raw === undefined || raw === null || raw === "" ? { value: undefined } : { error: "Choose yes or no." };
    }
    case "select": {
      const values = (field.options ?? []).map((o) => o.value);
      return typeof raw === "string" && values.includes(raw) ? { value: raw } : { error: "Choose one of the listed options." };
    }
    case "multi_select": {
      const values = (field.options ?? []).map((o) => o.value);
      if (!Array.isArray(raw) || raw.some((v) => typeof v !== "string" || !values.includes(v))) return { error: "Choose only listed options." };
      const unique = [...new Set(raw as string[])];
      const max = field.validation?.maxItems;
      if (typeof max === "number" && unique.length > max) return { error: `Choose at most ${max}.` };
      return { value: unique };
    }
    case "country": {
      const code = typeof raw === "string" ? raw.trim().toUpperCase() : "";
      return /^[A-Z]{2}$/.test(code) ? { value: code } : { error: "Choose a country." };
    }
    case "address": {
      if (!isPlainObject(raw)) return { error: "Enter an address." };
      const unknown = Object.keys(raw).find((k) => !(ADDRESS_PARTS as readonly string[]).includes(k));
      if (unknown) return { error: `Unknown address part "${unknown}".` };
      const address: Record<string, string> = {};
      for (const part of ADDRESS_PARTS) {
        const piece = raw[part];
        if (piece === undefined || piece === null || piece === "") continue;
        if (typeof piece !== "string") return { error: "Enter text in each address line." };
        const text = piece.trim();
        if (!text) continue;
        if (text.length > 200) return { error: "Use at most 200 characters in each address line." };
        if (part === "country" && !/^[A-Za-z]{2}$/.test(text)) return { error: "Choose a country." };
        address[part] = part === "country" ? text.toUpperCase() : text;
      }
      return Object.keys(address).length ? { value: address } : { value: undefined };
    }
    case "repeated_group": {
      if (raw === undefined || raw === null) return { value: undefined };
      if (!Array.isArray(raw)) return { error: "Enter a list of entries." };
      const requested = field.validation?.maxItems;
      const maxRows = Math.min(typeof requested === "number" ? requested : MAX_REPEATED_ROWS, MAX_REPEATED_ROWS);
      if (raw.length > maxRows) return { error: `Add at most ${maxRows} entries.` };
      const rows: Answers[] = [];
      const rowErrors: Record<string, string> = {};
      raw.forEach((row, index) => {
        if (!isPlainObject(row)) {
          rowErrors[`${index}`] = "Each entry must be an object.";
          return;
        }
        const normalized: Answers = {};
        for (const key of Object.keys(row)) {
          const child = (field.children ?? []).find((c) => c.key === key);
          if (!child) {
            rowErrors[`${index}.${key}`] = "Unknown field.";
            continue;
          }
          const result = normalizeValue(child, row[key], strict);
          if (result.error) rowErrors[`${index}.${key}`] = result.error;
          else if (result.value !== undefined) normalized[key] = result.value;
        }
        rows.push(normalized);
      });
      return Object.keys(rowErrors).length ? { error: "Check the highlighted entries.", rowErrors } : { value: rows };
    }
    default:
      return { error: "Unsupported field type." };
  }
}

// ---------------------------------------------------------------------------
// Template traversal helpers
// ---------------------------------------------------------------------------

export function topLevelFields(template: FormTemplateShape): FormField[] {
  return template.sections.flatMap((section) => section.fields);
}

export function findField(template: FormTemplateShape, key: string): FormField | null {
  return topLevelFields(template).find((field) => field.key === key) ?? null;
}

function isClientWritable(field: FormField): boolean {
  return !field.staffOnly && field.clientEditable !== false;
}

/** Which top-level keys `actor` ('client' | 'employee') may write. */
export function writableKeys(template: FormTemplateShape, actor: "client" | "employee"): string[] {
  return topLevelFields(template)
    .filter((field) => (actor === "client" ? isClientWritable(field) : true))
    .map((field) => field.key);
}

/** Template sections as a client may see them: staff-only fields (and any section left empty) removed. */
export function sectionsForClient(template: FormTemplateShape): FormSection[] {
  return template.sections
    .map((section) => ({ ...section, fields: section.fields.filter((field) => !field.staffOnly) }))
    .filter((section) => section.fields.length > 0);
}

// ---------------------------------------------------------------------------
// Patches (autosave)
// ---------------------------------------------------------------------------

/**
 * Validates and normalises an answer patch for `actor`. Unknown keys and keys
 * the actor may not write are errors, never silently dropped.
 * `values[key] === undefined` means "clear this answer".
 */
export function normalizePatch(
  template: FormTemplateShape,
  patch: unknown,
  actor: "client" | "employee",
): { values: Answers; errors: FieldErrors } {
  const values: Answers = {};
  const errors: FieldErrors = {};
  if (!isPlainObject(patch)) return { values, errors: { _form: "Answers must be an object." } };

  const writable = new Set(writableKeys(template, actor));
  for (const key of Object.keys(patch)) {
    const field = findField(template, key);
    if (!field) {
      errors[key] = "Unknown field.";
    } else if (!writable.has(key)) {
      errors[key] = "This field cannot be edited.";
    } else {
      const result = normalizeValue(field, patch[key], false);
      if (result.error) {
        errors[key] = result.error;
        for (const [rowPath, message] of Object.entries(result.rowErrors ?? {})) errors[rowErrorPath(key, rowPath)] = message;
      } else values[key] = result.value;
    }
  }
  return { values, errors };
}

// ---------------------------------------------------------------------------
// Full validation (submit) and progress
// ---------------------------------------------------------------------------

function isCompleteAddress(address: unknown): boolean {
  const a = address as Record<string, unknown> | undefined;
  return !!(a && a.line1 && a.city && a.country);
}

/** One top-level field against a finished answer set. Returns an error string or ''. */
function fieldProblem(field: FormField, answers: Answers, errors: FieldErrors): string {
  const result = normalizeValue(field, answers[field.key], true);
  if (result.error) {
    for (const [rowPath, message] of Object.entries(result.rowErrors ?? {})) errors[rowErrorPath(field.key, rowPath)] = message;
    return result.error;
  }
  const value = result.value;
  if (!field.required) return "";

  if (field.type === "repeated_group") {
    const rows = (value as Answers[] | undefined) ?? [];
    const min = Math.max(1, field.validation?.minItems ?? 1);
    if (rows.length < min) return min === 1 ? "Add at least one entry." : `Add at least ${min} entries.`;
    let rowsOk = true;
    rows.forEach((row, index) => {
      for (const child of field.children ?? []) {
        if (!isVisible(child, row)) continue;
        const childResult = normalizeValue(child, row[child.key], true);
        if (childResult.error) {
          errors[`${field.key}[${index}].${child.key}`] = childResult.error;
          rowsOk = false;
        } else if (child.required && childResult.value === undefined) {
          errors[`${field.key}[${index}].${child.key}`] = "This field is required.";
          rowsOk = false;
        }
      }
    });
    return rowsOk ? "" : "Complete every entry.";
  }
  if (field.type === "address") return isCompleteAddress(value) ? "" : "Enter the street, city and country.";
  return value === undefined ? "This field is required." : "";
}

/** Rows of a NON-required group are still validated for shape/format when present. */
function optionalGroupRowProblems(field: FormField, answers: Answers, errors: FieldErrors): void {
  const rows = (normalizeValue(field, answers[field.key], true).value as Answers[] | undefined) ?? [];
  rows.forEach((row, index) => {
    for (const child of field.children ?? []) {
      if (!isVisible(child, row)) continue;
      if (child.required && normalizeValue(child, row[child.key], true).value === undefined) {
        errors[`${field.key}[${index}].${child.key}`] = "This field is required.";
      }
    }
  });
}

/** Authoritative validation of a finished form. Staff-only fields never block a client submission. */
export function validateForSubmit(template: FormTemplateShape, answers: unknown): FieldErrors {
  const source: Answers = isPlainObject(answers) ? answers : {};
  const errors: FieldErrors = {};
  for (const field of topLevelFields(template)) {
    if (!isVisible(field, source)) continue;
    const message = fieldProblem(field, source, errors);
    if (message) errors[field.key] = message;
    else if (field.type === "repeated_group" && !field.required) optionalGroupRowProblems(field, source, errors);
  }
  return errors;
}

/** completed required, currently-visible, client-completable fields / total of the same. An intake metric only. */
export function computeProgress(template: FormTemplateShape, answers: unknown): Progress {
  const source: Answers = isPlainObject(answers) ? answers : {};
  let total = 0;
  let completed = 0;
  for (const field of topLevelFields(template)) {
    if (!field.required || field.staffOnly || !isVisible(field, source)) continue;
    total += 1;
    if (!fieldProblem(field, source, {})) completed += 1;
  }
  return { completedRequired: completed, totalRequired: total, percent: total === 0 ? 100 : Math.floor((completed / total) * 100) };
}
