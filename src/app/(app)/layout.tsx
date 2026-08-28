import type { Metadata } from "next";

import { site } from "@/lib/content/site";
import { AppShell } from "@/components/app/app-shell";
import { CLIENT_NAV, visibleEmployeeNav } from "@/lib/content/app-navigation";
import { getEmployeeContext } from "@/lib/auth/current-employee";
import { roleLabel } from "@/lib/auth/capabilities";
import { getSessionActorFromCookieStore } from "@/lib/auth/session";
import { getUnreadCountForClient } from "@/lib/notifications/notification-service";
import { getDb } from "@/lib/db";
import { ClientUser } from "@/lib/models/ClientUser";
import { AdminUser } from "@/lib/models/AdminUser";

/**
 * SaaS application shell (ADR-009 §6). Serves both actor types from one
 * layout, choosing navigation by whichever session is present.
 *
 * Resolution order matters: an employee session wins over a client one, so
 * a staff member who also happens to hold a client account on a shared
 * browser sees the staff shell on /staff rather than a confusing hybrid.
 * Neither session grants anything here — this only picks a menu. Every
 * page underneath calls `requireEmployee`/`requireClient` and every
 * case-scoped resource runs its own row-level check.
 *
 * Unauthenticated pages (both login screens, activate, password reset)
 * render through this layout too, which is why it must never throw or
 * redirect when there is no session — it falls back to a bare shell.
 */
export const metadata: Metadata = {
  title: {
    default: `${site.name} Portal`,
    template: `%s | ${site.name} Portal`,
  },
  // Subtree-wide, so a page added here later is noindex by default rather
  // than by remembering to opt in (ADR-008 §5).
  robots: { index: false, follow: false },
};

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const db = getDb();
  if (db) await db;

  const employee = await getEmployeeContext();

  if (employee) {
    const user = db
      ? await AdminUser.findById(employee.actor.adminUserId).select("name").lean()
      : null;

    return (
      <AppShell
        nav={visibleEmployeeNav(employee.can)}
        displayName={(user as { name?: string } | null)?.name || "Team member"}
        roleLabel={roleLabel(employee.role)}
        areaLabel="Staff"
        logoutPath="/api/staff/logout"
      >
        {children}
      </AppShell>
    );
  }

  const clientActor = db ? await getSessionActorFromCookieStore() : null;

  if (clientActor) {
    const client = await ClientUser.findById(clientActor.clientUserId).select("firstName email").lean();
    const unread = await getUnreadCountForClient(clientActor.clientUserId);
    const record = client as { firstName?: string; email?: string } | null;

    return (
      <AppShell
        nav={CLIENT_NAV}
        displayName={record?.firstName || record?.email || "Your account"}
        // Clients have no role — passing null keeps internal role codes out
        // of the client-facing shell by construction, not by remembering.
        roleLabel={null}
        areaLabel="Client Portal"
        logoutPath="/api/portal/logout"
        notificationsHref="/portal/notifications"
        unreadCount={unread}
      >
        {children}
      </AppShell>
    );
  }

  // Signed out: login, activate, and password-reset screens.
  return (
    <>
      <header className="border-navy-800 bg-navy-900 border-b">
        <div className="mx-auto flex w-full max-w-7xl items-center px-6 py-4 sm:px-8">
          <span className="font-display text-lg font-semibold text-white">{site.name}</span>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
    </>
  );
}
