/**
 * Staff-only panel states. The shared layout primitives live in
 * `components/app/panel.tsx`; what stays here is the one state whose copy
 * names internal roles and therefore must never be reachable from a
 * client-facing page.
 */

/**
 * Rendered when a role holds no capability for a panel. Deliberately
 * distinct from an empty state: "you cannot see this" and "there is
 * nothing here" are different facts, and showing the second for the first
 * would tell a specialist a case has no documents when it may have many.
 */
export function RestrictedState({ what }: { what: string }) {
  return (
    <div className="px-6 py-10 text-center">
      <p className="text-ink-500 text-sm">
        {what} aren&apos;t part of your role. Ask an administrator if you need access.
      </p>
    </div>
  );
}
