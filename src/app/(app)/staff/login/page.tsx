import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Container } from "@/components/ui/container";
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
    <Container width="prose" className="py-20 sm:py-28">
      <div className="mx-auto max-w-sm">
        <h1 className="font-display text-navy-900 text-2xl font-semibold sm:text-3xl">Staff sign in</h1>
        <p className="text-ink-600 mt-2 text-[0.9375rem]">
          For Immigration Horizons team members. Use the same credentials as the admin system.
        </p>

        <div className="rounded-panel border-ink-200 shadow-subtle mt-8 border bg-white p-6">
          <StaffLoginForm next={target} />
        </div>

        <p className="text-ink-500 mt-6 text-xs">
          Looking for your client account?{" "}
          <Link href="/portal/login" className="text-navy-700 font-semibold hover:underline">
            Sign in to the client portal
          </Link>
          .
        </p>
      </div>
    </Container>
  );
}
