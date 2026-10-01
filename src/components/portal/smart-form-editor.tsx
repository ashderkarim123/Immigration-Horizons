"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge, type BadgeTone } from "@/components/app/badge";
import { Field, Select, TextArea, TextInput } from "@/components/forms/fields";
import { ADDRESS_PARTS, MAX_REPEATED_ROWS } from "@/lib/content/smart-form-constants";
import { isVisible, type Answers, type FormField, type FormSection } from "@/lib/forms/engine";
import type { toClientDto } from "@/lib/forms/form-service";

/**
 * Client-side Smart Form editor (ADR-021 §12, §26). The browser holds no
 * rules: it renders the sections the server sent, uses `isVisible` purely to
 * show/hide, and lets the server validate, normalise and decide every state
 * change. Answers live only in component state — never localStorage.
 */

export type ClientFormDto = ReturnType<typeof toClientDto>;
type SaveState = "saved" | "saving" | "unsaved" | "conflict" | "error";
type Row = Record<string, unknown>;

const AUTOSAVE_DELAY_MS = 1200;

const STATUS: Record<string, { label: string; tone: BadgeTone; note: string }> = {
  draft: { label: "Draft", tone: "neutral", note: "Your answers save automatically. Submit when every required question is answered." },
  needs_changes: { label: "Changes requested", tone: "warning", note: "Our team asked for a few changes. Update your answers, then submit again." },
  submitted: { label: "Submitted", tone: "gold", note: "Thank you — our team is reviewing this form. You will be notified if anything is needed." },
  approved: { label: "Approved", tone: "positive", note: "Our team has reviewed and approved this form. It can no longer be edited." },
  locked: { label: "Final", tone: "positive", note: "This form is final and can no longer be edited." },
};

const SAVE_LABEL: Record<SaveState, string> = {
  saved: "Saved",
  saving: "Saving…",
  unsaved: "Unsaved changes",
  conflict: "Conflict — reload to continue",
  error: "Couldn’t save — retry",
};

const NOT_COUNTRIES = new Set(["AC", "CP", "DG", "EA", "EU", "EZ", "IC", "TA", "UN", "XA", "XB", "ZZ", "QO"]);
let countryCache: { code: string; name: string }[] | null = null;
function countries() {
  if (countryCache) return countryCache;
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const list: { code: string; name: string }[] = [];
  for (let a = 65; a <= 90; a += 1) {
    for (let b = 65; b <= 90; b += 1) {
      const code = String.fromCharCode(a, b);
      if (NOT_COUNTRIES.has(code)) continue;
      try {
        const name = names.of(code);
        if (name && name !== code) list.push({ code, name });
      } catch {
        /* not a region code */
      }
    }
  }
  countryCache = list.sort((x, y) => x.name.localeCompare(y.name));
  return countryCache;
}

const ADDRESS_LABELS: Record<(typeof ADDRESS_PARTS)[number], string> = {
  line1: "Street address",
  line2: "Apartment, suite, etc.",
  city: "City",
  region: "State / region",
  postalCode: "Postal code",
  country: "Country",
};

export function SmartFormEditor({ initial }: { initial: ClientFormDto }) {
  const [form, setForm] = useState(initial);
  const [answers, setAnswers] = useState<Answers>(initial.answers);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const revision = useRef(initial.revision);
  const dirty = useRef<Set<string>>(new Set());
  const answersRef = useRef(answers);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const halted = useRef(false);

  const editable = form.actions.canEdit && saveState !== "conflict";
  const status = STATUS[form.status] ?? STATUS.draft;

  const applyServerForm = useCallback((next: ClientFormDto) => {
    setForm(next);
    setAnswers(next.answers);
    answersRef.current = next.answers;
    revision.current = next.revision;
    dirty.current = new Set();
  }, []);

  /** Sends the dirty keys once. Returns true when the server has them (or there was nothing to send). */
  const flush = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) await inFlight.current;
    if (halted.current) return false;
    if (dirty.current.size === 0) return true;

    const keys = [...dirty.current];
    const patch = Object.fromEntries(keys.map((key) => [key, answersRef.current[key] ?? null]));
    dirty.current = new Set();
    setSaveState("saving");

    const run = (async () => {
      try {
        const res = await fetch(`/api/portal/forms/${form.id}/answers`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revision: revision.current, answers: patch }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok) {
          revision.current = data.form.revision;
          setForm((prev) => ({ ...prev, revision: data.form.revision, progress: data.form.progress, lastSavedAt: data.form.lastSavedAt }));
          setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !keys.some((k) => key === k || key.startsWith(`${k}[`)))));
          setSaveState(dirty.current.size ? "unsaved" : "saved");
          return true;
        }
        keys.forEach((k) => dirty.current.add(k));
        if (res.status === 409) {
          halted.current = true;
          setSaveState("conflict");
          setBanner(data?.error?.message ?? "This form was changed elsewhere. Reload to see the latest version.");
        } else if (res.status === 422) {
          setErrors(data?.error?.fieldErrors ?? {});
          setSaveState("error");
        } else setSaveState("error");
        return false;
      } catch {
        keys.forEach((k) => dirty.current.add(k));
        setSaveState("error");
        return false;
      }
    })();
    inFlight.current = run;
    const ok = await run;
    inFlight.current = null;
    return ok;
  }, [form.id]);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setSaveState("unsaved");
    timer.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
  }, [flush]);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current.size > 0) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  function setAnswer(key: string, value: unknown) {
    const next = { ...answersRef.current, [key]: value };
    answersRef.current = next;
    setAnswers(next);
    dirty.current.add(key);
    schedule();
  }

  async function reload() {
    const res = await fetch(`/api/portal/forms/${form.id}`);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setBanner("We couldn’t reload this form. Please refresh the page.");
      return;
    }
    halted.current = false;
    setBanner(null);
    setErrors({});
    setSaveState("saved");
    applyServerForm(data.form);
  }

  async function submit() {
    if (timer.current) clearTimeout(timer.current);
    setSubmitting(true);
    setBanner(null);
    const saved = await flush();
    if (!saved) {
      setSubmitting(false);
      return;
    }
    const res = await fetch(`/api/portal/forms/${form.id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision: revision.current }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setSubmitting(false);

    if (res?.ok) {
      setErrors({});
      setSaveState("saved");
      applyServerForm(data.form);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (res?.status === 422) {
      setErrors(data?.error?.fieldErrors ?? {});
      setBanner("Some answers need attention before you can submit. They are marked below.");
    } else if (res?.status === 409) {
      halted.current = true;
      setSaveState("conflict");
      setBanner(data?.error?.message ?? "This form changed. Reload to continue.");
    } else {
      setBanner("We couldn’t submit this form. Please try again.");
    }
  }

  const errorCount = Object.keys(errors).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-panel border-ink-200 shadow-subtle border bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge tone={status.tone}>{status.label}</Badge>
          {form.actions.canEdit ? (
            <p role="status" aria-live="polite" className={saveState === "error" || saveState === "conflict" ? "text-sm font-medium text-red-700" : "text-ink-500 text-sm"}>
              {SAVE_LABEL[saveState]}
            </p>
          ) : null}
        </div>
        <p className="text-ink-600 mt-3 text-sm">{status.note}</p>
        {form.clientReviewNote ? (
          <div className="border-gold-300 bg-gold-50 mt-4 rounded-lg border px-4 py-3 text-sm text-navy-900">
            <p className="font-semibold">Note from our team</p>
            <p className="mt-1 whitespace-pre-line">{form.clientReviewNote}</p>
          </div>
        ) : null}
        <div className="mt-4">
          <div className="text-ink-500 flex justify-between text-xs">
            <span>Required questions answered</span>
            <span>{form.progress.completedRequired} of {form.progress.totalRequired}</span>
          </div>
          <div
            role="progressbar"
            aria-label="Required questions answered"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={form.progress.percent}
            className="bg-navy-50 mt-1.5 h-2 overflow-hidden rounded-full"
          >
            <div className="bg-gold-500 h-full rounded-full transition-[width] duration-300" style={{ width: `${form.progress.percent}%` }} />
          </div>
        </div>
      </div>

      {banner ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{banner}</span>
          {saveState === "conflict" ? (
            <Button type="button" size="sm" variant="gold" onClick={() => void reload()}>
              Reload latest version
            </Button>
          ) : null}
        </div>
      ) : null}
      {errorCount > 0 && !banner ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Please fix the {errorCount === 1 ? "answer" : `${errorCount} answers`} marked below.
        </p>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (editable) void submit();
        }}
        noValidate
        className="flex flex-col gap-6"
      >
        {form.sections.map((section) => (
          <Section key={section.key} section={section} answers={answers} errors={errors} disabled={!editable} onChange={setAnswer} />
        ))}

        {form.actions.canSubmit ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="gold" disabled={!editable || submitting}>
              {submitting ? "Submitting…" : form.status === "needs_changes" ? "Resubmit for review" : "Submit for review"}
            </Button>
            {saveState === "error" ? (
              <Button type="button" variant="outline" size="sm" onClick={() => void flush()}>
                Retry save
              </Button>
            ) : null}
          </div>
        ) : null}
      </form>
    </div>
  );
}

function Section({
  section,
  answers,
  errors,
  disabled,
  onChange,
}: {
  section: FormSection;
  answers: Answers;
  errors: Record<string, string>;
  disabled: boolean;
  onChange: (key: string, value: unknown) => void;
}) {
  const visible = section.fields.filter((field) => isVisible(field, answers));
  if (visible.length === 0) return null;
  return (
    <fieldset className="rounded-panel border-ink-200 shadow-subtle flex flex-col gap-5 border bg-white p-5 sm:p-6">
      <legend className="font-display text-navy-800 px-1 text-lg font-semibold">{section.title}</legend>
      {visible.map((field) => (
        <FieldInput key={field.key} field={field} value={answers[field.key]} error={errors[field.key]} errors={errors} disabled={disabled} onChange={(value) => onChange(field.key, value)} />
      ))}
    </fieldset>
  );
}

function FieldInput({
  field,
  value,
  error,
  errors,
  disabled,
  onChange,
  id = `f-${field.key}`,
}: {
  field: FormField;
  value: unknown;
  error?: string;
  errors: Record<string, string>;
  disabled: boolean;
  onChange: (value: unknown) => void;
  id?: string;
}) {
  const common = { id, disabled, error: Boolean(error) };
  const text = typeof value === "string" || typeof value === "number" ? String(value) : "";
  const wrap = (control: React.ReactNode) => (
    <Field label={field.label} htmlFor={id} required={field.required} hint={field.helpText} error={error}>
      {control}
    </Field>
  );

  switch (field.type) {
    case "textarea":
      return wrap(<TextArea {...common} value={text} onChange={(e) => onChange(e.target.value)} />);
    case "email":
    case "phone":
    case "number":
    case "date":
    case "text": {
      const type = { email: "email", phone: "tel", number: "number", date: "date", text: "text" }[field.type];
      return wrap(<TextInput {...common} type={type} inputMode={field.type === "number" ? "decimal" : undefined} value={text} onChange={(e) => onChange(e.target.value)} />);
    }
    case "yes_no":
      return (
        <fieldset aria-describedby={error ? `${id}-error` : undefined}>
          <legend className="text-navy-800 mb-1.5 text-sm font-semibold">
            {field.label}
            {field.required ? <span className="text-gold-700" aria-hidden> *</span> : null}
          </legend>
          <div className="flex gap-6">
            {[
              { label: "Yes", value: true },
              { label: "No", value: false },
            ].map((option) => (
              <label key={option.label} className="text-navy-900 flex items-center gap-2 text-sm">
                <input type="radio" name={id} disabled={disabled} checked={value === option.value} onChange={() => onChange(option.value)} className="accent-navy-700 h-4 w-4" />
                {option.label}
              </label>
            ))}
          </div>
          {field.helpText ? <p className="text-ink-500 mt-1 text-xs">{field.helpText}</p> : null}
          {error ? <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-red-600">{error}</p> : null}
        </fieldset>
      );
    case "select":
      return wrap(
        <Select {...common} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>,
      );
    case "country":
      return wrap(<CountrySelect {...common} value={typeof value === "string" ? value : ""} onChange={onChange} />);
    case "multi_select": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <fieldset aria-describedby={error ? `${id}-error` : undefined}>
          <legend className="text-navy-800 mb-1.5 text-sm font-semibold">
            {field.label}
            {field.required ? <span className="text-gold-700" aria-hidden> *</span> : null}
          </legend>
          <div className="flex flex-col gap-2">
            {field.options?.map((o) => (
              <label key={o.value} className="text-navy-900 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={selected.includes(o.value)}
                  onChange={(e) => onChange(e.target.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value))}
                  className="accent-navy-700 h-4 w-4"
                />
                {o.label}
              </label>
            ))}
          </div>
          {error ? <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-red-600">{error}</p> : null}
        </fieldset>
      );
    }
    case "address": {
      const address = (value && typeof value === "object" ? value : {}) as Record<string, string>;
      return (
        <fieldset aria-describedby={error ? `${id}-error` : undefined}>
          <legend className="text-navy-800 mb-2 text-sm font-semibold">
            {field.label}
            {field.required ? <span className="text-gold-700" aria-hidden> *</span> : null}
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {ADDRESS_PARTS.map((part) => (
              <div key={part} className={part === "line1" || part === "line2" ? "sm:col-span-2" : undefined}>
                <Field label={ADDRESS_LABELS[part]} htmlFor={`${id}-${part}`}>
                  {part === "country" ? (
                    <CountrySelect id={`${id}-${part}`} disabled={disabled} error={Boolean(error)} value={address.country ?? ""} onChange={(v) => onChange({ ...address, country: v })} />
                  ) : (
                    <TextInput id={`${id}-${part}`} disabled={disabled} value={address[part] ?? ""} onChange={(e) => onChange({ ...address, [part]: e.target.value })} autoComplete={part === "postalCode" ? "postal-code" : undefined} />
                  )}
                </Field>
              </div>
            ))}
          </div>
          {error ? <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-red-600">{error}</p> : null}
        </fieldset>
      );
    }
    case "repeated_group":
      return <GroupInput field={field} id={id} rows={Array.isArray(value) ? (value as Row[]) : []} error={error} errors={errors} disabled={disabled} onChange={onChange} />;
    default:
      return null;
  }
}

function CountrySelect({ value, onChange, ...rest }: { id: string; disabled: boolean; error: boolean; value: string; onChange: (value: string) => void }) {
  const list = useMemo(() => countries(), []);
  return (
    <Select id={rest.id} disabled={rest.disabled} error={rest.error} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose a country…</option>
      {list.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
    </Select>
  );
}

function GroupInput({
  field,
  id,
  rows,
  error,
  errors,
  disabled,
  onChange,
}: {
  field: FormField;
  id: string;
  rows: Row[];
  error?: string;
  errors: Record<string, string>;
  disabled: boolean;
  onChange: (value: unknown) => void;
}) {
  const max = Math.min(field.validation?.maxItems ?? MAX_REPEATED_ROWS, MAX_REPEATED_ROWS);
  const update = (index: number, key: string, value: unknown) => onChange(rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  return (
    <fieldset aria-describedby={error ? `${id}-error` : undefined}>
      <legend className="text-navy-800 mb-1 text-sm font-semibold">
        {field.label}
        {field.required ? <span className="text-gold-700" aria-hidden> *</span> : null}
      </legend>
      {field.helpText ? <p className="text-ink-500 mb-2 text-xs">{field.helpText}</p> : null}
      <ul className="flex flex-col gap-4">
        {rows.map((row, index) => (
          <li key={index} className="border-ink-200 bg-navy-50/30 rounded-xl border p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-navy-800 text-sm font-semibold">Entry {index + 1}</span>
              {!disabled ? (
                <button type="button" onClick={() => onChange(rows.filter((_, i) => i !== index))} className="inline-flex items-center gap-1 text-sm font-medium text-red-700 hover:underline">
                  <Trash2 size={14} aria-hidden /> Remove<span className="sr-only"> entry {index + 1}</span>
                </button>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {field.children?.filter((child) => isVisible(child, row)).map((child) => (
                <FieldInput
                  key={child.key}
                  field={child}
                  id={`${id}-${index}-${child.key}`}
                  value={row[child.key]}
                  error={errors[`${field.key}[${index}].${child.key}`]}
                  errors={errors}
                  disabled={disabled}
                  onChange={(value) => update(index, child.key, value)}
                />
              ))}
            </div>
          </li>
        ))}
      </ul>
      {!disabled && rows.length < max ? (
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => onChange([...rows, {}])}>
          <Plus size={14} aria-hidden /> Add entry
        </Button>
      ) : null}
      {error ? <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-red-600">{error}</p> : null}
    </fieldset>
  );
}
