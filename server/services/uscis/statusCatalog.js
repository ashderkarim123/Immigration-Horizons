/**
 * Provider text handling for USCIS tracking (ADR-026): a conservative title
 * catalog and the plain-text sanitizer. Nothing here interprets a status
 * legally or derives a deadline from provider text; unknown titles are `other`.
 */

const normalizeTitle = (title) =>
  String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Exact official titles only. Add an entry deliberately, with a test, when USCIS documents a new one.
const CATALOG = new Map(
  [
    ['Case Was Received', 'received'],
    ['Case Is Being Actively Reviewed By USCIS', 'actively_reviewed'],
    ['Request for Additional Evidence Was Mailed', 'rfe_issued'],
    ['Response To USCIS Request For Evidence Was Received', 'response_received'],
    ['Notice of Intent to Deny Was Mailed', 'noid_issued'],
    ['Interview Was Scheduled', 'interview_scheduled'],
    ['Case Was Approved', 'approved'],
    ['Case Was Denied', 'denied'],
    ['Case Was Transferred And A New Office Has Jurisdiction', 'transferred'],
  ].map(([title, category]) => [normalizeTitle(title), category]),
);

const categoryForTitle = (title) => CATALOG.get(normalizeTitle(title)) || 'other';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/**
 * Provider HTML-ish text to bounded plain text: block tags become spaces, every other tag and any
 * leftover angle bracket is removed, entities are decoded, control characters dropped. The result is
 * only ever rendered through escaping templates, but it also never contains markup.
 */
function toPlainText(value, max) {
  let s = String(value === null || value === undefined ? '' : value);
  s = s.replace(/<(script|style)[\s\S]*?<\/\1\s*>/gi, ' ');
  s = s.replace(/<\s*\/?\s*(br|p|div|li|tr|h[1-6])\b[^>]*>/gi, ' ');
  s = s.replace(/<[^>]*>/g, '');
  s = s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 31 && code < 0x110000 ? String.fromCodePoint(code) : ' ';
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
  s = s.replace(/[<>]/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

module.exports = { categoryForTitle, normalizeTitle, toPlainText };
