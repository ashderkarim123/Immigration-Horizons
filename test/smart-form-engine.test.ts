import { test } from "node:test";
import assert from "node:assert/strict";

import vectors from "../docs/architecture/smart-form-engine-vectors.json" with { type: "json" };
import {
  computeProgress,
  isVisible,
  normalizePatch,
  normalizeValue,
  sectionsForClient,
  validateForSubmit,
  writableKeys,
  type FormField,
  type FormTemplateShape,
} from "../src/lib/forms/engine";

/**
 * Root half of the engine parity check (ADR-021): the same vectors that
 * server/test/smart-form-engine.test.js asserts against the Express engine.
 * If the two engines ever disagree, one of these two suites fails.
 */

const template = vectors.template as unknown as FormTemplateShape;

for (const v of vectors.normalizeValue) {
  test(`normalizeValue: ${v.name}`, () => {
    const result = normalizeValue(v.field as FormField, v.raw, v.strict);
    if ("error" in v && v.error) assert.ok(result.error, "expected an error");
    else assert.deepEqual(result.value === undefined ? null : result.value, "value" in v ? v.value : null);
  });
}

for (const v of vectors.isVisible) {
  test(`isVisible: ${v.name}`, () => assert.equal(isVisible(v.field as FormField, v.scope), v.visible));
}

for (const v of vectors.validateForSubmit) {
  test(`validateForSubmit/progress: ${v.name}`, () => {
    assert.deepEqual(Object.keys(validateForSubmit(template, v.answers)).sort(), [...v.errorKeys].sort());
    assert.deepEqual(computeProgress(template, v.answers), v.progress);
  });
}

test("writableKeys: clients never get staff-only keys", () => {
  assert.deepEqual(writableKeys(template, "client"), vectors.writableKeys.client);
  assert.deepEqual(writableKeys(template, "employee"), vectors.writableKeys.employee);
});

test("sectionsForClient removes staff-only fields and empties sections", () => {
  const shaped = { sections: [{ key: "s", title: "S", fields: [{ key: "a", label: "A", type: "text", staffOnly: true }] }, { key: "t", title: "T", fields: [{ key: "b", label: "B", type: "text" }, { key: "c", label: "C", type: "text", staffOnly: true }] }] } as FormTemplateShape;
  assert.deepEqual(sectionsForClient(shaped).map((s) => [s.key, s.fields.map((f) => f.key)]), [["t", ["b"]]]);
});

test("normalizePatch: unknown and staff-only keys are errors for a client, never silently dropped", () => {
  const { values, errors } = normalizePatch(template, { name: " Ada ", staff_note: "x", nope: 1 }, "client");
  assert.deepEqual(values, { name: "Ada" });
  assert.deepEqual(Object.keys(errors).sort(), ["nope", "staff_note"]);
});

test("normalizePatch: a group row error is addressable by path", () => {
  const { errors } = normalizePatch(template, { trips: [{ when: "not-a-date" }] }, "client");
  assert.ok(errors.trips);
  assert.ok(errors["trips[0].when"]);
});
