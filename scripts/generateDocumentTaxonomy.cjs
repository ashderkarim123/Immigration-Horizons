const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const { DEFAULT_CATEGORY_TEMPLATE } = require('../server/utils/documentConstants');
const { DOCUMENT_TYPES_BY_CATEGORY } = require('../server/utils/documentTaxonomy');
const mirror = path.join(root, 'src/lib/content/document-constants.ts');
const source = fs.readFileSync(mirror, 'utf8');
fs.writeFileSync(mirror, source.replace(/export const DEFAULT_CATEGORY_TEMPLATE: DefaultCategoryTemplateEntry\[\] = \[[\s\S]*?\n\];/, `export const DEFAULT_CATEGORY_TEMPLATE: DefaultCategoryTemplateEntry[] = ${JSON.stringify(DEFAULT_CATEGORY_TEMPLATE, null, 2)};`));
const contractPath = path.join(root, 'docs/architecture/document-schema-contract.json');
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
contract.defaultCategoryTemplateKeys = [...DEFAULT_CATEGORY_TEMPLATE].sort((a, b) => a.order - b.order).map(t => t.templateKey);
fs.writeFileSync(contractPath, JSON.stringify(contract, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'src/lib/content/document-taxonomy.ts'),
  '// Generated from server/utils/documentTaxonomy.js.\n' +
  `export const DOCUMENT_TYPES_BY_CATEGORY: Record<string, string[]> = ${JSON.stringify(DOCUMENT_TYPES_BY_CATEGORY, null, 2)};\n` +
  "export function documentTypesForCategory(templateKey: string) { return [...(DOCUMENT_TYPES_BY_CATEGORY[templateKey] || []), 'Other']; }\n");
