import { cn } from "@/lib/utils";

const baseField =
  "w-full min-h-12 rounded-xl border bg-white px-4 py-3 font-sans text-[0.9375rem] text-navy-900 shadow-[0_1px_2px_rgba(15,31,61,0.03)] placeholder:text-ink-400 transition-[border-color,box-shadow,background-color] duration-200 hover:border-navy-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gold-500/35 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-500";

export function Field({
  label,
  htmlFor,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-navy-800 font-sans text-sm font-semibold"
      >
        {label}
        {required ? (
          <span className="text-gold-700" aria-hidden>
            {" "}
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint && !error ? (
        <p className="text-ink-500 text-xs">{hint}</p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({
  error,
  className,
  ...props
}: React.ComponentProps<"input"> & { error?: boolean }) {
  return (
    <input
      className={cn(
        baseField,
        error
          ? "border-red-400 ring-2 ring-red-100"
          : "border-ink-300 focus:border-navy-500",
        className,
      )}
      aria-invalid={error || undefined}
      {...props}
    />
  );
}

export function TextArea({
  error,
  className,
  ...props
}: React.ComponentProps<"textarea"> & { error?: boolean }) {
  return (
    <textarea
      className={cn(
        baseField,
        "min-h-32 resize-y",
        error
          ? "border-red-400 ring-2 ring-red-100"
          : "border-ink-300 focus:border-navy-500",
        className,
      )}
      aria-invalid={error || undefined}
      {...props}
    />
  );
}

export function Select({
  error,
  className,
  children,
  ...props
}: React.ComponentProps<"select"> & { error?: boolean }) {
  return (
    <select
      className={cn(
        baseField,
        "appearance-none bg-[length:1.25rem] bg-[right_0.75rem_center] bg-no-repeat pr-10",
        error
          ? "border-red-400 ring-2 ring-red-100"
          : "border-ink-300 focus:border-navy-500",
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%236b7688' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      aria-invalid={error || undefined}
      {...props}
    >
      {children}
    </select>
  );
}

/** Hidden honeypot — bots fill it, humans never see it. */
export function Honeypot() {
  return (
    <div className="absolute -left-[9999px]" aria-hidden>
      <label htmlFor="company">Company (leave blank)</label>
      <input
        type="text"
        id="company"
        name="company"
        tabIndex={-1}
        autoComplete="off"
      />
    </div>
  );
}

/** Forwards captured UTM/click-id params through the form as hidden inputs. */
export function TrackingFields({
  params,
}: {
  params: Record<string, string>;
}) {
  return (
    <>
      {Object.entries(params).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
    </>
  );
}
