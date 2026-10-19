"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "@bprogress/next/app";
import { Alert, Button, Form, Input } from "antd";
import { authClient } from "@/shared/libs/auth-client.lib";
import { AuthHeading } from "@/modules/authentication/components/auth-heading";
import { OTP_RULES, authErrorMessage } from "@/modules/authentication/authentication.constant";
import { ResendCodeButton } from "@/modules/authentication/components/resend-code-button";

function sendCode(email: string, onError: (message: string) => void) {
  return authClient.emailOtp.sendVerificationOtp({ email, type: "email-verification" }).then((result) => {
    if (result.error) onError(authErrorMessage(result.error));
  });
}

// Xác minh email bằng mã OTP của better-auth (loại email-verification). Mở trang có ?email= thì gửi mã ngay một lần.
export function VerifyForm({ email }: { email?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const sent = useRef(false);

  useEffect(() => {
    if (!email || sent.current) return;
    sent.current = true;
    void sendCode(email, setError);
  }, [email]);

  if (!email) {
    return (
      <>
        <AuthHeading title="Xác minh email" description="Đường dẫn xác minh thiếu địa chỉ email. Mở lại đường dẫn trong thư, hoặc đăng nhập để được gửi lại." />
        <Link href="/authentication/sign-in" className="text-sm text-primary hover:underline">
          Quay lại đăng nhập
        </Link>
      </>
    );
  }

  return (
    <>
      <AuthHeading
        title="Xác minh email"
        description={
          <>
            Mã gồm 6 số đã được gửi tới <span className="font-medium whitespace-nowrap text-foreground">{email}</span>. Mã có hiệu lực 10 phút.
          </>
        }
      />
      {error && <Alert type="error" showIcon title={error} className="mb-6" />}
      <Form
        layout="vertical"
        size="large"
        requiredMark={false}
        onValuesChange={() => setError(null)}
        onFinish={(values: { code: string }) =>
          startTransition(async () => {
            const result = await authClient.emailOtp.verifyEmail({ email, otp: values.code });
            if (result.error) {
              setError(authErrorMessage(result.error));
              return;
            }
            router.push("/authentication/sign-in");
          })
        }
      >
        <Form.Item name="code" label="Mã xác minh" rules={OTP_RULES}>
          <Input.OTP length={6} autoFocus />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={isPending} className="mt-2">
          Xác minh
        </Button>
      </Form>
      <div className="mt-6 flex items-center justify-between gap-3 text-sm">
        <ResendCodeButton
          onResend={() => {
            setError(null);
            void sendCode(email, setError);
          }}
        />
        <Link href="/authentication/sign-in" className="text-sm text-primary hover:underline">
          Quay lại đăng nhập
        </Link>
      </div>
    </>
  );
}
