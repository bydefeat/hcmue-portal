"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "@bprogress/next/app";
import { Alert, Button, Form, Input } from "antd";
import { authClient } from "@/shared/libs/auth-client.lib";
import { formatStudentCode, isStudentEmail, normalizeStudentCode } from "@/shared/libs/student-code.lib";
import { AuthHeading } from "@/modules/authentication/components/auth-heading";
import { EMAIL_RULES, NEW_PASSWORD_RULES, OTP_RULES, authErrorMessage } from "@/modules/authentication/authentication.constant";
import { ResendCodeButton } from "@/modules/authentication/components/resend-code-button";

type Step = "email" | "code" | "password" | "done";

function EmailText({ email }: { email: string }) {
  return <span className="font-medium whitespace-nowrap text-foreground">{email}</span>;
}

function studentCodeOf(email: string) {
  return isStudentEmail(email) ? formatStudentCode(email.split("@")[0]) : undefined;
}

function ErrorAlert({ message }: { message: string | null }) {
  return message ? <Alert type="error" showIcon title={message} className="mb-6" /> : null;
}

export function ForgotPasswordForm({ defaultEmail, isActivation = false }: { defaultEmail?: string; isActivation?: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const requestCode = (target: string) =>
    authClient.emailOtp.requestPasswordReset({ email: target }).then((result) => {
      if (result.error) setError(authErrorMessage(result.error));
      return !result.error;
    });

  if (step === "email") {
    return (
      <>
        <AuthHeading
          title={isActivation ? "Kích hoạt tài khoản" : "Quên mật khẩu"}
          description={
            isActivation
              ? "Lần đầu dùng HCMUE Portal: nhập email trường cấp, mã gồm 6 số sẽ được gửi tới đó để bạn đặt mật khẩu. Email sinh viên có dạng 5001104013@student.hcmue.edu.vn, cán bộ và giảng viên dùng email công vụ @hcmue.edu.vn. Tên đăng nhập vẫn là mã số sinh viên hoặc mã số cán bộ, giảng viên."
              : "Nhập email trường cấp, mã đặt lại mật khẩu sẽ được gửi tới đó. Email sinh viên có dạng 5001104013@student.hcmue.edu.vn, cán bộ và giảng viên dùng email công vụ @hcmue.edu.vn."
          }
        />
        <ErrorAlert message={error} />
        <Form
          layout="vertical"
          size="large"
          requiredMark={false}
          initialValues={{ email }}
          onValuesChange={() => setError(null)}
          onFinish={(values: { email: string }) =>
            startTransition(async () => {
              const target = values.email.trim().toLowerCase();
              if (!(await requestCode(target))) return;
              setEmail(target);
              setStep("code");
            })
          }
        >
          <Form.Item
            name="email"
            label="Email"
            rules={[
              ...EMAIL_RULES,
              {
                validator: (_, value?: string) => {
                  const local = value?.split("@")[0] ?? "";
                  return value && isStudentEmail(value) && !/^\d{10}$/.test(normalizeStudentCode(local))
                    ? Promise.reject(new Error("Email sinh viên gồm 10 chữ số của MSSV, ví dụ 5001104013@student.hcmue.edu.vn"))
                    : Promise.resolve();
                },
              },
            ]}
          >
            <Input autoFocus autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} placeholder="5001104013@student.hcmue.edu.vn" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={isPending} className="mt-2">
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
              Nếu <EmailText email={email} /> đã được cấp tài khoản, mã gồm 6 số đã được gửi tới đó. Mã có hiệu lực 10 phút.
            </>
          }
        />
        <ErrorAlert message={error} />
        <Form
          layout="vertical"
          size="large"
          requiredMark={false}
          onValuesChange={() => setError(null)}
          onFinish={(values: { code: string }) =>
            startTransition(async () => {
              const result = await authClient.emailOtp.checkVerificationOtp({ email, otp: values.code, type: "forget-password" });
              if (result.error) {
                setError(authErrorMessage(result.error));
                return;
              }
              setOtp(values.code);
              setStep("password");
            })
          }
        >
          <Form.Item name="code" label={isActivation ? "Mã kích hoạt" : "Mã đặt lại"} rules={OTP_RULES}>
            <Input.OTP length={6} autoFocus />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={isPending} className="mt-2">
            Tiếp tục
          </Button>
        </Form>
        <div className="mt-6 flex items-center justify-between gap-3 text-sm">
          <ResendCodeButton
            onResend={() => {
              setError(null);
              void requestCode(email);
            }}
          />
          <Button
            type="link"
            size="small"
            onClick={() => {
              setError(null);
              setStep("email");
            }}
            className="px-0"
          >
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
          title={isActivation ? "Đặt mật khẩu" : "Đặt mật khẩu mới"}
          description={
            isActivation ? (
              <>
                Cho tài khoản <EmailText email={email} />. Dùng mật khẩu này cho các lần đăng nhập sau.
              </>
            ) : (
              <>
                Cho tài khoản <EmailText email={email} />. Các thiết bị khác đang đăng nhập sẽ bị đăng xuất.
              </>
            )
          }
        />
        <ErrorAlert message={error} />
        <Form
          layout="vertical"
          size="large"
          requiredMark={false}
          onValuesChange={() => setError(null)}
          onFinish={(values: { password: string }) =>
            startTransition(async () => {
              const result = await authClient.emailOtp.resetPassword({ email, otp, password: values.password });
              if (result.error) {
                setError(authErrorMessage(result.error));
                return;
              }
              setStep("done");
            })
          }
        >
          {studentCodeOf(email) && <input type="text" name="username" autoComplete="username" value={studentCodeOf(email)} readOnly hidden />}
          <Form.Item name="password" label="Mật khẩu mới" extra="Ít nhất 8 ký tự" rules={NEW_PASSWORD_RULES}>
            <Input.Password autoFocus autoComplete="new-password" placeholder="Tạo mật khẩu" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={isPending} className="mt-2">
            Lưu mật khẩu
          </Button>
        </Form>
      </>
    );
  }

  const studentCode = studentCodeOf(email);
  return (
    <>
      <AuthHeading
        title={isActivation ? "Đã kích hoạt tài khoản" : "Đã đổi mật khẩu"}
        description={
          studentCode
            ? `Đăng nhập bằng mã số sinh viên ${studentCode} và mật khẩu vừa đặt.`
            : "Đăng nhập bằng mã số cán bộ, giảng viên (ghi trong thư kích hoạt, ví dụ GV104011) và mật khẩu vừa đặt."
        }
      />
      <Button
        type="primary"
        size="large"
        block
        autoFocus
        onClick={() => router.push(studentCode ? `/authentication/sign-in?username=${encodeURIComponent(studentCode)}` : "/authentication/sign-in")}
      >
        Đăng nhập
      </Button>
    </>
  );
}
