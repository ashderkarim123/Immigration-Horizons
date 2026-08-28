import type { Metadata } from "next";
import { Suspense } from "react";

import { Container } from "@/components/ui/container";
import { ActivateForm } from "@/components/portal/activate-form";

export const metadata: Metadata = {
  title: "Activate Your Client Portal Account",
  robots: { index: false, follow: false },
};

export default function PortalActivatePage() {
  return (
    <Container width="default" className="py-16 sm:py-24">
      <div className="mx-auto max-w-md">
        <h1 className="font-display text-navy-900 text-2xl font-semibold sm:text-3xl">
          Activate your portal account
        </h1>
        <p className="text-ink-600 mt-2 text-[0.9375rem]">
          Set a password to finish creating your account and view your
          consultation.
        </p>

        <div className="rounded-panel border-ink-200 mt-8 border bg-white p-6 shadow-subtle sm:p-8">
          <Suspense fallback={null}>
            <ActivateForm />
          </Suspense>
        </div>
      </div>
    </Container>
  );
}
