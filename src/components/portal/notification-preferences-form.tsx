"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { postPortalJson } from "@/lib/auth/portal-fetch";

type DigestFrequency = "daily" | "weekly" | "off";

export function NotificationPreferencesForm({
  initialMentionEmails,
  initialDigestEmails,
  initialDigestFrequency,
}: {
  initialMentionEmails: boolean;
  initialDigestEmails: boolean;
  initialDigestFrequency: DigestFrequency;
}) {
  const router = useRouter();
  const [mentionEmails, setMentionEmails] = useState(initialMentionEmails);
  const [digestEmails, setDigestEmails] = useState(initialDigestEmails);
  const [digestFrequency, setDigestFrequency] = useState<DigestFrequency>(initialDigestFrequency);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setSaved(false);
    const result = await postPortalJson("/api/portal/notifications/preferences", {
      mentionEmails,
      digestEmails,
      digestFrequency,
    });
    setPending(false);
    if (result.ok) {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={mentionEmails}
          onChange={(e) => setMentionEmails(e.target.checked)}
          className="border-ink-300 text-navy-700 mt-0.5 h-4 w-4 rounded"
        />
        <span className="text-navy-800">Email me when someone mentions me in a case channel</span>
      </label>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={digestEmails}
          onChange={(e) => setDigestEmails(e.target.checked)}
          className="border-ink-300 text-navy-700 mt-0.5 h-4 w-4 rounded"
        />
        <span className="text-navy-800">Send me a digest of unread notifications</span>
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-navy-800 font-medium">Digest frequency</span>
        <select
          value={digestFrequency}
          onChange={(e) => setDigestFrequency(e.target.value as DigestFrequency)}
          className="border-ink-200 focus:border-navy-400 w-full max-w-xs rounded-xl border p-2.5 text-sm focus:outline-none"
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="off">Off</option>
        </select>
      </label>

      <p className="text-ink-500 text-xs">
        Invitations, schedule changes, and replacement requests are always sent immediately regardless of these
        settings.
      </p>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="gold" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save preferences"}
        </Button>
        {saved ? <span className="text-ink-500 text-xs">Saved.</span> : null}
      </div>
    </form>
  );
}
