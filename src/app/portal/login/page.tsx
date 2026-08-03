import type { Metadata } from "next";
import { Suspense } from "react";

import { Container } from "@/components/ui/container";
import { LoginForm } from "@/components/portal/login-form";

export const metadata: Metadata = {
  title: "Client Portal Login",
  robots: { index: false, follow: false },
};

export default function PortalLoginPage() {
  return (
    <Container width="default" className="py-16 sm:py-24">
      <div className="mx-auto max-w-md">
        <h1 className="font-display text-navy-900 text-2xl font-semibold sm:text-3xl">
          Sign in to your portal
        </h1>
        <p className="text-ink-600 mt-2 text-[0.9375rem]">
          Track your consultation and case updates.
        </p>

        <div className="rounded-panel border-ink-200 mt-8 border bg-white p-6 shadow-subtle sm:p-8">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="text-ink-500 mt-6 text-sm">
          Don&apos;t have an account yet?{" "}
          <a href="/consultation" className="text-navy-700 font-semibold hover:underline">
            Book a free consultation
          </a>{" "}
          to get started.
        </p>
      </div>
    </Container>
  );
}
