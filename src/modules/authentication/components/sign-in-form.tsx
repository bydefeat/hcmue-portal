"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Form, Input } from "antd";
import { AuthHeading } from "./auth-heading";
import { EMAIL_RULES } from "../authentication.constant";

type SignInValues = {
  email: string;
  password: string;
};

export function SignInForm({ defaultEmail }: { defaultEmail?: string }) {
  const router = useRouter();
  const [form] = Form.useForm<SignInValues>();
  const [isPending, startTransition] = useTransition();
  const email = Form.useWatch("email", form);
  const forgotHref = email
    ? `/authentication/forgot-password?email=${encodeURIComponent(email)}`
    : "/authentication/forgot-password";

  return (
    <>
      <AuthHeading title="Đăng nhập" />
      <Form
        form={form}
        layout="vertical"
        size="large"
        requiredMark={false}
        initialValues={{ email: defaultEmail }}
        onFinish={() => startTransition(() => router.push("/application/dashboard"))}
      >
        <Form.Item name="email" label="Email" rules={EMAIL_RULES}>
          <Input autoFocus={!defaultEmail} autoComplete="email" inputMode="email" placeholder="Nhập email" />
        </Form.Item>
        <div className="relative">
          <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, message: "Chưa nhập mật khẩu" }]}>
            <Input.Password autoFocus={Boolean(defaultEmail)} autoComplete="current-password" placeholder="Nhập mật khẩu" />
          </Form.Item>
          <Link href={forgotHref} className="absolute top-0 right-0 flex h-10 items-center text-sm text-foreground hover:underline">
            Quên mật khẩu?
          </Link>
        </div>
        <Button type="primary" htmlType="submit" block loading={isPending}>
          Đăng nhập
        </Button>
      </Form>
    </>
  );
}
