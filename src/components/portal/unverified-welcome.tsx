import { MailWarning } from "lucide-react";

import { Container } from "@/components/ui/container";
import { PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/app/panel";

import { ResendActivationButton } from "./resend-activation-button";

/** j***@example.com: enough for the owner to recognise it, not enough to disclose it to a passer-by. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "your email address";
  return `${email[0]}***${email.slice(at)}`;
}

const LOCKED_UNTIL_ACTIVATED = ["Your cases and their progress", "Documents you share with your team", "Messages with your team", "Your profile and security settings"];

/**
 * What someone sees after signing up but before verifying their email (ADR-033).
 * Deliberately shows nothing from the database beyond the address they typed:
 * this session has not proven it owns that mailbox, so no consultation record, staff
 * note, case or document can appear here.
 */
export function UnverifiedWelcome({ email, firstName }: { email: string; firstName: string }) {
  return (
    <Container width="default" className="py-10 sm:py-14">
      <PageHeader
        title={firstName ? `Welcome, ${firstName}` : "Welcome"}
        description="Your consultation request has been received. One step remains before your portal opens."
      />

      <div className="flex flex-col gap-6">
        <div role="alert" className="flex gap-4 rounded-2xl border border-amber-300 bg-amber-50 p-5 sm:p-6">
          <MailWarning aria-hidden size={26} strokeWidth={1.75} className="mt-0.5 shrink-0 text-amber-700" />
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="text-navy-900 text-lg font-semibold">Your email is not verified yet</h2>
              <p className="text-ink-700 mt-1 text-[0.9375rem] leading-relaxed">
                We sent an activation link to <strong>{maskEmail(email)}</strong>. Open it to verify your email and choose a password.
                The link works once and expires after 7 days.
              </p>
            </div>
            <ResendActivationButton />
          </div>
        </div>

        <Panel title="Unlocked once you activate">
          <ul className="text-ink-700 flex flex-col gap-2 text-[0.9375rem]">
            {LOCKED_UNTIL_ACTIVATED.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden className="bg-gold-500 mt-2 h-1.5 w-1.5 shrink-0 rounded-full" />
                {item}
              </li>
            ))}
          </ul>
          <p className="text-ink-500 mt-4 text-sm">
            We hold everything back until the email is verified so that nobody else can open your case by typing your address.
          </p>
        </Panel>
      </div>
    </Container>
  );
}
