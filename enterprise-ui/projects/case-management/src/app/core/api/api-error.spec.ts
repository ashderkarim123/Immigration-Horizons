import { apiErrorCode, apiErrorMessage, apiFieldErrors } from './api-error';

/** Angular wraps the Express body as HttpErrorResponse.error, so the envelope sits at err.error.error. */
const wrap = (error: object) => ({ error: { error } });

describe('api error envelope helpers', () => {
  it('reads the code, the first field message, and falls back safely', () => {
    const err = wrap({ code: 'conflict', message: 'null', fieldErrors: [{ field: 'receiptNumber', message: 'Already used.' }, { field: 'title', message: 'Too long.' }] });
    expect(apiErrorCode(err)).toBe('conflict');
    expect(apiErrorMessage(err, 'fallback')).toBe('Already used.');
    expect(apiErrorMessage(wrap({ message: 'Plain.' }), 'fallback')).toBe('Plain.');
    expect(apiErrorMessage(wrap({ message: 'null' }), 'fallback')).toBe('fallback');
    expect(apiErrorMessage(null, 'fallback')).toBe('fallback');
    expect(apiErrorCode(undefined)).toBe('');
  });

  it('maps field errors by field name, keeping the first per field and ignoring incomplete entries', () => {
    const err = wrap({ fieldErrors: [{ field: 'a', message: 'one' }, { field: 'a', message: 'two' }, { message: 'no field' }, { field: 'b' }, { field: 'c', message: 'three' }] });
    expect(apiFieldErrors(err)).toEqual({ a: 'one', c: 'three' });
    expect(apiFieldErrors(wrap({ fieldErrors: null }))).toEqual({});
    expect(apiFieldErrors('nope')).toEqual({});
  });
});
