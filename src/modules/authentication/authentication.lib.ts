import "server-only";
import { APIError, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import { username } from "better-auth/plugins/username";
import { account, rateLimit, session, user, verification } from "@/modules/authentication/authentication.schema";
import { AUTH_COOKIE_PREFIX, AUTH_ERROR, SESSION_MAX_AGE_SECONDS } from "@/modules/authentication/authentication.constant";
import { db } from "@/shared/libs/db.lib";
import { env } from "@/shared/libs/env.lib";
import { sendMail } from "@/shared/libs/mail.lib";
import { formatStudentCode, isStudentCode, isStudentEmail, normalizeStudentCode } from "@/shared/libs/student-code.lib";

const OTP_PURPOSE: Record<string, string> = {
  "forget-password": "đặt lại mật khẩu",
  "email-verification": "xác minh email",
  "sign-in": "đăng nhập",
};

// Đường dẫn bị chặn: sinh viên chỉ đăng nhập bằng MSSV; không ai đăng nhập bằng mã OTP qua email.
const BLOCKED_PATHS = new Set(["/sign-in/email-otp"]);

export const auth = betterAuth({
  appName: "HCMUE Portal",
  secret: env.DEFEAT_BETTER_AUTH_SESSION_SIGNING_SECRET_KEY,
  baseURL: env.DEFEAT_BETTER_AUTH_PUBLIC_APPLICATION_BASE_URL,
  trustedOrigins: env.DEFEAT_BETTER_AUTH_TRUSTED_ORIGINS,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification, rateLimit },
  }),
  user: {
    additionalFields: {
      role: { type: "string", required: false, input: false },
    },
  },
  emailAndPassword: {
    enabled: true,
    // Tài khoản do trường cấp, không có đăng ký.
    disableSignUp: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
  },
  session: {
    expiresIn: SESSION_MAX_AGE_SECONDS,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5, strategy: "jwe" },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    customRules: {
      "/sign-in/username": { window: 60, max: 5 },
      "/sign-in/email": { window: 60, max: 5 },
      "/email-otp/request-password-reset": { window: 60, max: 3 },
      "/email-otp/check-verification-otp": { window: 60, max: 5 },
      "/email-otp/reset-password": { window: 60, max: 5 },
    },
  },
  advanced: {
    cookiePrefix: AUTH_COOKIE_PREFIX,
    database: { generateId: false },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (BLOCKED_PATHS.has(ctx.path)) throw new APIError("NOT_FOUND");
      if (ctx.path === "/sign-in/email" && typeof ctx.body?.email === "string" && isStudentEmail(ctx.body.email)) {
        throw new APIError("UNAUTHORIZED", { message: AUTH_ERROR.STUDENT_USE_CODE, code: "STUDENT_USE_CODE" });
      }
      if (ctx.path === "/email-otp/send-verification-otp" && ctx.body?.type !== "email-verification") {
        throw new APIError("BAD_REQUEST");
      }
    }),
  },
  plugins: [
    username({
      // Nhận cả "50.01.104.013" lẫn "5001104013", tra theo 10 chữ số.
      usernameNormalization: normalizeStudentCode,
      displayUsernameNormalization: formatStudentCode,
      // Plugin kiểm độ dài và validator trên chuỗi chưa chuẩn hoá ở endpoint đăng nhập, nên validator tự chuẩn hoá.
      usernameValidator: isStudentCode,
      immutableUsername: true,
    }),
    emailOTP({
      otpLength: 6,
      expiresIn: 60 * 10,
      allowedAttempts: 5,
      storeOTP: "hashed",
      disableSignUp: true,
      async sendVerificationOTP({ email, otp, type }) {
        const purpose = OTP_PURPOSE[type] ?? "xác minh tài khoản";
        // Không chờ gửi xong: thời gian phản hồi không được để lộ email có tài khoản hay không.
        void sendMail({
          to: email,
          subject: `Mã ${purpose} HCMUE Portal: ${otp}`,
          text: `Mã ${purpose} của bạn là ${otp}. Mã có hiệu lực 10 phút, chỉ dùng được một lần.\n\nNếu bạn không yêu cầu mã này, bỏ qua thư; mật khẩu của bạn không thay đổi.`,
        });
      },
    }),
    // Phải đứng cuối để Set-Cookie từ server action đi được ra trình duyệt.
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
