"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "@bprogress/next/app";
import { Button, Form, Input } from "antd";
import { AuthHeading } from "@/modules/authentication/components/auth-heading";
import { EMAIL_RULES, NEW_PASSWORD_RULES, OTP_RULES } from "@/modules/authentication/authentication.constant";
import { ResendCodeButton } from "@/modules/authentication/components/resend-code-button";

type Step = "email" | "code" | "password" | "done";

function EmailText({ email }: { email: string }) {
  return <span className="font-medium whitespace-nowrap text-foreground">{email}</span>;
}

export function ForgotPasswordForm({ defaultEmail }: { defaultEmail?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(defaultEmail ?? "");

  if (step === "email") {
    return (
      <>
        <AuthHeading
          title="Quên mật khẩu"
          description="Nhập email đã đăng ký, mã đặt lại mật khẩu sẽ được gửi tới đó."
        />
        <Form
          layout="vertical"
          size="large"
          requiredMark={false}
          initialValues={{ email }}
          onFinish={(values: { email: string }) => {
            setEmail(values.email);
            setStep("code");
          }}
        >
          <Form.Item name="email" label="Email" rules={EMAIL_RULES}>
            <Input autoFocus autoComplete="email" inputMode="email" placeholder="Nhập email" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block className="mt-2">
            Gửi mã
          </Button>
        </Form>
        <p className="mt-6 text-center text-sm">
          <Link href="/authentication/sign-in" className="text-sm text-primary hover:underline">
            Quay lại đăng nhập
          </Link>
        </p>
      </>
    );
  }

  if (step === "code") {
    return (
      <>
        <AuthHeading
          title="Nhập mã"
          description={
            <>
              Nếu <EmailText email={email} /> đã đăng ký, mã gồm 6 số đã được gửi tới đó.
            </>
          }
        />
        <Form layout="vertical" size="large" requiredMark={false} onFinish={() => setStep("password")}>
          <Form.Item name="code" label="Mã đặt lại" rules={OTP_RULES}>
            <Input.OTP length={6} autoFocus />
          </Form.Item>
          <Button type="primary" htmlType="submit" block className="mt-2">
            Tiếp tục
          </Button>
        </Form>
        <div className="mt-6 flex items-center justify-between gap-3 text-sm">
          <ResendCodeButton />
          <Button type="link" size="small" onClick={() => setStep("email")} className="px-0">
            Đổi email
          </Button>
        </div>
      </>
    );
  }

  if (step === "password") {
    return (
      <>
        <AuthHeading
          title="Đặt mật khẩu mới"
          description={
            <>
              Cho tài khoản <EmailText email={email} />.
            </>
          }
        />
        <Form layout="vertical" size="large" requiredMark={false} onFinish={() => setStep("done")}>
          <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
          <Form.Item name="password" label="Mật khẩu mới" extra="Ít nhất 8 ký tự" rules={NEW_PASSWORD_RULES}>
            <Input.Password autoFocus autoComplete="new-password" placeholder="Tạo mật khẩu" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block className="mt-2">
            Lưu mật khẩu
          </Button>
        </Form>
      </>
    );
  }

  return (
    <>
      <AuthHeading title="Đã đổi mật khẩu" description="Dùng mật khẩu mới để đăng nhập." />
      <Button
        type="primary"
        size="large"
        block
        autoFocus
        onClick={() => router.push(`/authentication/sign-in?username=${encodeURIComponent(email)}`)}
      >
        Đăng nhập
      </Button>
    </>
  );
}
