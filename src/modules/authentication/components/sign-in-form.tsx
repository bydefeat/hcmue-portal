"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "@bprogress/next/app";
import { Alert, Button, Divider, Form, Input } from "antd";
import { landingAfterSignIn, parseRoles } from "@/shared/constants/role.constant";
import { authClient } from "@/shared/libs/auth-client.lib";
import { isStudentCode, studentEmailOf } from "@/shared/libs/student-code.lib";
import { AUTH_ERROR, LOGIN_NAME_HINT, authErrorMessage } from "@/modules/authentication/authentication.constant";
import { AuthHeading } from "@/modules/authentication/components/auth-heading";

type SignInValues = {
  username: string;
  password: string;
};

function signIn({ username, password }: SignInValues) {
  return authClient.signIn.username({ username: username.trim(), password });
}

export function SignInForm({ defaultUsername, next }: { defaultUsername?: string; next?: string | null }) {
  const router = useRouter();
  const [form] = Form.useForm<SignInValues>();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const username = Form.useWatch("username", form)?.trim();
  const recoveryEmail = username && isStudentCode(username) ? studentEmailOf(username) : username?.includes("@") ? username : undefined;
  const forgotHref = recoveryEmail
    ? `/authentication/forgot-password?email=${encodeURIComponent(recoveryEmail)}`
    : "/authentication/forgot-password";
  const activateHref = `${forgotHref}${recoveryEmail ? "&" : "?"}activate=1`;

  return (
    <>
      <AuthHeading title="Đăng nhập" />
      {error && <Alert type="error" showIcon title={error} className="mb-6" />}
      <Form
        form={form}
        layout="vertical"
        size="large"
        requiredMark={false}
        initialValues={{ username: defaultUsername }}
        onValuesChange={() => setError(null)}
        onFinish={(values) =>
          startTransition(async () => {
            const result = await signIn(values);
            if (result.error) {
              setError(authErrorMessage(result.error));
              form.setFieldValue("password", "");
              return;
            }
            const roles = parseRoles((result.data.user as { role?: string | null }).role);
            router.replace(landingAfterSignIn(roles, next));
            router.refresh();
          })
        }
      >
        <Form.Item
          name="username"
          label="Tên đăng nhập"
          extra={LOGIN_NAME_HINT}
          rules={[
            { required: true, whitespace: true, message: "Chưa nhập tên đăng nhập" },
            {
              validator: (_, value?: string) => (value?.includes("@") ? Promise.reject(new Error(AUTH_ERROR.USE_LOGIN_CODE)) : Promise.resolve()),
            },
          ]}
        >
          <Input
            autoFocus={!defaultUsername}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="MSSV hoặc mã số cán bộ, giảng viên"
          />
        </Form.Item>
        <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, message: "Chưa nhập mật khẩu" }]}>
          <Input.Password autoFocus={Boolean(defaultUsername)} autoComplete="current-password" placeholder="Nhập mật khẩu" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={isPending} className="mt-2">
          Đăng nhập
        </Button>
      </Form>
      <Divider className="my-6" />
      <div className="flex flex-col gap-2 text-sm">
        <Link href={forgotHref} className="w-fit text-primary hover:underline">
          Quên mật khẩu?
        </Link>
        <p className="text-pretty text-muted">
          Lần đầu đăng nhập?{" "}
          <Link href={activateHref} className="text-primary hover:underline">
            Kích hoạt tài khoản
          </Link>{" "}
          bằng mã gửi tới email trường để tự đặt mật khẩu.
        </p>
      </div>
    </>
  );
}
