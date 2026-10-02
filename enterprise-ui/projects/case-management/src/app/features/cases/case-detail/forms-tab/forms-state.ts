import { FormAnswers, FormCondition, FormStatus } from '../../../../core/api/form.types';

/**
 * Pure helpers for the Forms tab. The browser holds no validation rules: it
 * uses `isFieldVisible` only to show/hide, mirroring the server's closed set
 * of four operators. The server decides everything else.
 */

const truthy = (value: unknown): boolean =>
  !(value === undefined || value === null || value === false || value === '' || (Array.isArray(value) && value.length === 0));

const equal = (actual: unknown, expected: unknown): boolean => (Array.isArray(actual) ? actual.includes(expected) : actual === expected);

export function isFieldVisible(field: { visibilityCondition?: FormCondition }, scope: FormAnswers | null | undefined): boolean {
  const condition = field.visibilityCondition;
  if (!condition) return true;
  const actual = scope ? scope[condition.field] : undefined;
  switch (condition.op) {
    case 'equals':
      return equal(actual, condition.value);
    case 'notEquals':
      return !equal(actual, condition.value);
    case 'isTruthy':
      return truthy(actual);
    case 'isFalsy':
      return !truthy(actual);
    default:
      return false; // an unknown operator never reveals a field
  }
}

export const STATUS_LABELS: Record<FormStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  needs_changes: 'Changes requested',
  approved: 'Approved',
  locked: 'Locked',
};

/** `variant` of the shared status badge — explicit, because `locked` would auto-colour as danger. */
export const STATUS_VARIANTS: Record<FormStatus, 'neutral' | 'purple' | 'warning' | 'success' | 'info'> = {
  draft: 'neutral',
  submitted: 'purple',
  needs_changes: 'warning',
  approved: 'success',
  locked: 'info',
};

const NOT_COUNTRIES = new Set(['AC', 'CP', 'DG', 'EA', 'EU', 'EZ', 'IC', 'TA', 'UN', 'XA', 'XB', 'ZZ', 'QO']);
let countryCache: { code: string; name: string }[] | null = null;

/** ISO-3166 alpha-2 regions with English names, from the platform's own locale data. */
export function countryOptions(): { code: string; name: string }[] {
  if (countryCache) return countryCache;
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  const list: { code: string; name: string }[] = [];
  for (let a = 65; a <= 90; a += 1) {
    for (let b = 65; b <= 90; b += 1) {
      const code = String.fromCharCode(a, b);
      if (NOT_COUNTRIES.has(code)) continue;
      try {
        const name = names.of(code);
        if (name && name !== code) list.push({ code, name });
      } catch {
        // not a region code
      }
    }
  }
  countryCache = list.sort((x, y) => x.name.localeCompare(y.name));
  return countryCache;
}

/** Errors that belong to `key` or to one of its group rows (`key[0].child`). */
export const withoutErrorsFor = (errors: Record<string, string>, keys: string[]): Record<string, string> =>
  Object.fromEntries(Object.entries(errors).filter(([path]) => !keys.some((key) => path === key || path.startsWith(`${key}[`))));
