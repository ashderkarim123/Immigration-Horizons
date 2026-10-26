import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

// The browser-tab and home-screen icons are declared in the root layout; a path
// with no file behind it 404s on every page view and falls back to a blank tab icon.
test("every icon the root layout declares exists under public/", () => {
  const layout = fs.readFileSync(path.join(ROOT, "src/app/layout.tsx"), "utf8");
  const block = layout.slice(layout.indexOf("icons:"), layout.indexOf("export const viewport"));
  const urls = [...block.matchAll(/["'](\/images\/[^"']+)["']/g)].map((m) => m[1]);
  assert.ok(urls.length >= 3, "expected the layout to declare icon files");
  for (const url of urls) {
    assert.ok(fs.existsSync(path.join(ROOT, "public", url)), `${url} is declared in layout.tsx but missing from public/`);
  }
});
