import type { Metadata } from "next";
import { Suspense } from "react";

import { Container } from "@/components/ui/container";
import { ResetPasswordForm } from "@/components/portal/reset-password-form";

export const metadata: Metadata = {
  title: "Set a New Password",
  robots: { index: false, follow: false },
};

export default function PortalResetPasswordPage() {
  return (
    <Container width="default" className="py-16 sm:py-24">
      <div className="mx-auto max-w-md">
        <h1 className="font-display text-navy-900 text-2xl font-semibold sm:text-3xl">
          Set a new password
        </h1>

        <div className="rounded-panel border-ink-200 mt-8 border bg-white p-6 shadow-subtle sm:p-8">
          <Suspense fallback={null}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </Container>
  );
}
