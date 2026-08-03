import type { Metadata } from "next";

import { Container } from "@/components/ui/container";
import { ForgotPasswordForm } from "@/components/portal/forgot-password-form";

export const metadata: Metadata = {
  title: "Reset Your Password",
  robots: { index: false, follow: false },
};

export default function PortalForgotPasswordPage() {
  return (
    <Container width="default" className="py-16 sm:py-24">
      <div className="mx-auto max-w-md">
        <h1 className="font-display text-navy-900 text-2xl font-semibold sm:text-3xl">
          Reset your password
        </h1>
        <p className="text-ink-600 mt-2 text-[0.9375rem]">
          Enter your email and we&apos;ll send you a link to reset your
          password.
        </p>

        <div className="rounded-panel border-ink-200 mt-8 border bg-white p-6 shadow-subtle sm:p-8">
          <ForgotPasswordForm />
        </div>

        <p className="text-ink-500 mt-6 text-sm">
          <a href="/portal/login" className="text-navy-700 font-semibold hover:underline">
            Back to sign in
          </a>
        </p>
      </div>
    </Container>
  );
}
