"use client";

import { useRouter } from "@bprogress/next/app";
import { useTransition } from "react";
import { Button } from "antd";
import { authClient } from "@/shared/libs/auth-client.lib";

export function SignOutButton({ primary = false }: { primary?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      type={primary ? "primary" : "default"}
      loading={isPending}
      onClick={() =>
        startTransition(async () => {
          try {
            await authClient.signOut();
          } finally {
            router.replace("/authentication/sign-in");
            router.refresh();
          }
        })
      }
    >
      Đăng xuất
    </Button>
  );
}
