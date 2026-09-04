import type { Metadata } from "next";
import { Suspense } from "react";

import Link from "next/link";

import { AuthFrame } from "@/components/app/auth-frame";
import { LoginForm } from "@/components/portal/login-form";

export const metadata: Metadata = {
  title: "Client Portal Login",
  robots: { index: false, follow: false },
};

export default function PortalLoginPage() {
  return (
    <AuthFrame
      eyebrow="Client portal"
      title="Welcome back"
      description="Sign in to follow your consultation, case milestones, documents, and messages."
      points={[
        "See case progress in one place",
        "Exchange documents securely",
        "Keep questions and replies together",
      ]}
      footer={
        <p>
          Don&apos;t have an account yet?{" "}
          <Link href="/consultation" className="text-navy-700 font-semibold hover:underline">
            Book a free consultation
          </Link>{" "}
          to get started.
        </p>
      }
    >
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthFrame>
  );
}
