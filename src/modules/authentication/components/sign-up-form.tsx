"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Form, Input } from "antd";
import { AuthHeading } from "./auth-heading";
import { EMAIL_RULES, NEW_PASSWORD_RULES } from "../authentication.constant";

type SignUpValues = {
  name: string;
  email: string;
  password: string;
};

export function SignUpForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <AuthHeading title="Đăng ký" />
      <Form<SignUpValues>
        layout="vertical"
        size="large"
        requiredMark={false}
        onFinish={({ email }) =>
          startTransition(() => router.push(`/authentication/verify?email=${encodeURIComponent(email)}`))
        }
      >
        <Form.Item name="name" label="Họ và tên" rules={[{ required: true, whitespace: true, message: "Chưa nhập họ và tên" }]}>
          <Input autoFocus autoComplete="name" placeholder="Nhập họ và tên" />
        </Form.Item>
        <Form.Item name="email" label="Email" rules={EMAIL_RULES}>
          <Input autoComplete="email" inputMode="email" placeholder="Nhập email" />
        </Form.Item>
        <Form.Item name="password" label="Mật khẩu" extra="Ít nhất 8 ký tự" rules={NEW_PASSWORD_RULES}>
          <Input.Password autoComplete="new-password" placeholder="Tạo mật khẩu" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={isPending}>
          Đăng ký
        </Button>
      </Form>
      <p className="mt-6 text-center text-sm text-muted">
        Đã có tài khoản?{" "}
        <Link href="/authentication/sign-in" className="font-medium text-primary hover:underline">
          Đăng nhập
        </Link>
      </p>
    </>
  );
}
