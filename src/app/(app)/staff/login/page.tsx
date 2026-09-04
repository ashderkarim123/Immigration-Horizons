import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthFrame } from "@/components/app/auth-frame";
import { StaffLoginForm } from "@/components/app/staff-login-form";
import { getEmployeeContext } from "@/lib/auth/current-employee";

export const metadata: Metadata = {
  title: "Staff Sign In",
  robots: { index: false, follow: false },
};

/** Only ever hand a /staff path to the form — never an attacker-supplied one. */
function safeNext(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (!value.startsWith("/staff")) return undefined;
  if (value.startsWith("//") || value.includes("://")) return undefined;
  return value;
}

export default async function StaffLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Already signed in — don't show a login form to someone who has a
  // session; send them where they were going.
  const existing = await getEmployeeContext();
  const { next } = await searchParams;
  const target = safeNext(next);
  if (existing) redirect(target ?? "/staff");

  return (
    <AuthFrame
      eyebrow="Team workspace"
      title="Staff sign in"
      description="Use the same Immigration Horizons credentials as the admin system."
      points={[
        "Review assigned cases and priorities",
        "Coordinate clients, queries, and tasks",
        "Work within role-based permissions",
      ]}
      footer={
        <p>
          Looking for your client account?{" "}
          <Link href="/portal/login" className="text-navy-700 font-semibold hover:underline">
            Sign in to the client portal
          </Link>
          .
        </p>
      }
    >
      <StaffLoginForm next={target} />
    </AuthFrame>
  );
}
