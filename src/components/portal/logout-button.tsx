"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { postPortalJson } from "@/lib/auth/portal-fetch";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    const result = await postPortalJson("/api/portal/logout", {});
    router.push(result.ok ? (result.redirectTo ?? "/portal/login") : "/portal/login");
    router.refresh();
  }

  return (
    <Button variant="outline" size="sm" onClick={handleLogout} disabled={pending}>
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
