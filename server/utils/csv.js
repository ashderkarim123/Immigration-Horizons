/**
 * CSV cell sanitizer — prevents formula/DDE injection when a spreadsheet
 * app (Excel, Google Sheets) opens an export containing public-form input.
 *
 * A cell beginning with `=`, `+`, `-`, `@`, a tab, or a carriage return can
 * be interpreted as a formula rather than literal text. Since this app's
 * lead-export fields (name, email, phone, message, ...) originate from an
 * anonymous, unauthenticated public form, any of them could carry such a
 * payload (e.g. a lead named `=HYPERLINK("http://evil","click")`).
 *
 * Fix: prefix a leading quote (`'`) — the standard, documented mitigation
 * (OWASP CSV Injection). Spreadsheet apps then treat the cell as plain
 * text instead of evaluating it. The literal `'` may remain visible; that
 * is the accepted trade-off for neutralizing formula execution.
 */
function csvCell(value) {
  let str = value === null || value === undefined ? '' : String(value);

  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  return `"${str.replace(/"/g, '""')}"`;
}

module.exports = { csvCell };
