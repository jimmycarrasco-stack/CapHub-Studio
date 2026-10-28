"use client";

import { Button } from "@/components/ui";

export function SignOutButton() {
  return (
    <Button
      className="w-full"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.assign("/login");
      }}
    >
      Sign out
    </Button>
  );
}
