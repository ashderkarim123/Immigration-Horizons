/* eslint-disable @typescript-eslint/no-require-imports */
// Generate a reviewed, checked-in list; never calculate country labels separately
// during SSR and hydration because Node and browsers can have different ICU data.
const fs = require('node:fs');
const path = require('node:path');
const excluded = new Set(['AC','CP','DG','EA','EU','EZ','IC','TA','UN','XA','XB','ZZ','QO']);
const names = new Intl.DisplayNames(['en'], { type: 'region' });
const countries = [];
for (let first = 65; first <= 90; first++) {
  for (let second = 65; second <= 90; second++) {
    const code = String.fromCharCode(first, second), name = names.of(code);
    if (!excluded.has(code) && name && name !== code) countries.push({ code, name });
  }
}
countries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
fs.writeFileSync(path.resolve(__dirname, '../src/lib/forms/countries.ts'), '// Shared static options prevent ICU-dependent hydration mismatches.\nexport const COUNTRIES: { code: string; name: string }[] = ' + JSON.stringify(countries, null, 2) + ';\n');
