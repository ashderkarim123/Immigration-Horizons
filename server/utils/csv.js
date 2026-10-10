/**
 * CSV helpers — one tested implementation shared by the Admin lead export and the Staff report exports.
 *
 * csvCell neutralizes formula/DDE injection: a cell whose first non-whitespace character is `=`, `+`, `-`, `@`, a tab or a
 * carriage return can be interpreted as a formula by Excel or Google Sheets. Several exported fields originate from
 * anonymous public forms or from user-entered labels (a lead named `=HYPERLINK("http://evil","click")`), so such a cell is
 * prefixed with a single quote (OWASP CSV Injection). The quote may remain visible in the spreadsheet; that is the accepted
 * trade-off. Leading whitespace is looked through, so `  =1+1` and `\n=1+1` are neutralized too. Every cell is quoted and
 * embedded quotes are doubled, so commas, quotes and newlines are always encoded correctly.
 */
const FORMULA_START = /^\s*[=+\-@\t\r]/;

function csvCell(value) {
  let str = value === null || value === undefined ? '' : String(value);
  if (FORMULA_START.test(str)) str = `'${str}`;
  return `"${str.replace(/"/g, '""')}"`;
}

/** One CSV record (no trailing newline). */
const csvRow = (cells) => cells.map(csvCell).join(',');

/**
 * A whole CSV document from an explicit column allowlist: `columns` is [{ key, label }] and each row is read ONLY through
 * those keys, so a field that is not listed can never leak into an export. UTF-8 with a BOM so spreadsheets read non-ASCII
 * names correctly; CRLF record separators.
 */
function toCsv(columns, rows) {
  const lines = [csvRow(columns.map((c) => c.label)), ...rows.map((row) => csvRow(columns.map((c) => row[c.key])))];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

module.exports = { csvCell, csvRow, toCsv };
