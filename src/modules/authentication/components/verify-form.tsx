"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Form, Input } from "antd";
import { AuthHeading } from "./auth-heading";
import { OTP_RULES } from "../authentication.constant";
import { ResendCodeButton } from "./resend-code-button";

export function VerifyForm({ email }: { email?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <AuthHeading
        title="Xác minh email"
        description={
          email ? (
            <>
              Mã gồm 6 số đã được gửi tới <span className="font-medium break-all text-foreground">{email}</span>.
            </>
          ) : (
            "Mã gồm 6 số đã được gửi tới email bạn vừa đăng ký."
          )
        }
      />
      <Form
        layout="vertical"
        size="large"
        requiredMark={false}
        onFinish={() => startTransition(() => router.push("/application/dashboard"))}
      >
        <Form.Item name="code" label="Mã xác minh" rules={OTP_RULES}>
          <Input.OTP length={6} autoFocus />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={isPending}>
          Xác minh
        </Button>
      </Form>
      <div className="mt-6 flex items-center justify-between gap-3 text-sm">
        <ResendCodeButton />
        <Link href="/authentication/sign-up" className="text-foreground hover:underline">
          Đổi email
        </Link>
      </div>
    </>
  );
}
