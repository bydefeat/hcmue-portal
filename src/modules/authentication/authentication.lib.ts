import "server-only";
import { APIError, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware, isAPIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import { username } from "better-auth/plugins/username";
import { eq } from "drizzle-orm";
import { account, rateLimit, session, user, verification } from "@/modules/authentication/authentication.schema";
import { AUTH_COOKIE_PREFIX, AUTH_ERROR, SESSION_MAX_AGE_SECONDS, SIGN_IN_LOCKOUT } from "@/modules/authentication/authentication.constant";
import { clearSignInFailures, lockIfTooManyFailures, reserveSignInAttempt } from "@/modules/authentication/authentication.lockout";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { env } from "@/shared/libs/env.lib";
import { sendMail } from "@/shared/libs/mail.lib";
import { clientIpFrom } from "@/shared/libs/client-ip.lib";
import { formatLoginName, isLoginName, normalizeLoginName } from "@/shared/libs/login-name.lib";

const OTP_PURPOSE: Record<string, string> = {
  "forget-password": "đặt lại mật khẩu",
  "email-verification": "xác minh email",
  "sign-in": "đăng nhập",
};

// Chỉ mở các endpoint app thật sự dùng. Còn lại trả 404: /update-user (tự đổi tên làm sai nhãn người thao tác trong nhật ký,
// tự đặt username là mã số của người khác), /is-username-available (dò mã số nào có tài khoản), /sign-in/email-otp, /sign-up/email,
// /forget-password/email-otp (bản trùng của request-password-reset, né được rate limit riêng), đổi email, xóa tài khoản,
// /email-otp/send-verification-otp và /email-otp/verify-email (gửi thư tới email bất kỳ; kích hoạt tài khoản đi qua luồng quên mật khẩu)...
export const ALLOWED_AUTH_PATHS = new Set([
  "/get-session",
  "/sign-out",
  "/sign-in/email",
  "/sign-in/username",
  "/change-password",
  "/email-otp/request-password-reset",
  "/email-otp/check-verification-otp",
  "/email-otp/reset-password",
  "/ok",
  "/error",
]);

// Tên đăng nhập chuẩn hoá của body /sign-in/username; sai dạng thì null (plugin tự trả INVALID_USERNAME, không cần đếm).
function signInLoginName(body: unknown) {
  const raw = (body as { username?: unknown } | undefined)?.username;
  return typeof raw === "string" && isLoginName(raw) ? normalizeLoginName(raw) : null;
}

// Nhận database để test dựng được bản chạy trong một transaction rồi rollback; app chỉ dùng `auth` bên dưới.
export function createAuth(database: typeof db | Transaction) {
  return betterAuth({
    appName: "HCMUE Portal",
    secret: env.DEFEAT_BETTER_AUTH_SESSION_SIGNING_SECRET_KEY,
    baseURL: env.DEFEAT_BETTER_AUTH_PUBLIC_APPLICATION_BASE_URL,
    trustedOrigins: env.DEFEAT_BETTER_AUTH_TRUSTED_ORIGINS,
    database: drizzleAdapter(database, {
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
      // getSession() vẫn kiểm phiên và cờ khóa ở DB mỗi request; cache ngắn chỉ để giảm tải cho chính better-auth.
      cookieCache: { enabled: true, maxAge: 60, strategy: "jwe" },
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
      // Rate limit theo IP từ header do reverse proxy ghi đè; không cấu hình proxy tin cậy thì chỉ nhận header một giá trị.
      ipAddress: { ipAddressHeaders: [env.DEFEAT_TRUSTED_IP_HEADER], trustedProxies: env.DEFEAT_TRUSTED_PROXIES },
      database: { generateId: false },
    },
    databaseHooks: {
      session: {
        create: {
          // Chặn ở bước tạo phiên (sau khi đã đúng mật khẩu) để câu "đang bị khóa" không lộ tài khoản nào tồn tại.
          async before(created) {
            const [row] = await database.select({ banned: user.banned }).from(user).where(eq(user.id, created.userId));
            if (row?.banned) throw new APIError("FORBIDDEN", { message: AUTH_ERROR.ACCOUNT_LOCKED, code: "BANNED_USER" });
          },
          async after(created) {
            await database.update(user).set({ lastSignInAt: new Date() }).where(eq(user.id, created.userId));
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (!ALLOWED_AUTH_PATHS.has(ctx.path)) throw new APIError("NOT_FOUND");
        // Mọi tài khoản đăng nhập bằng mã số. Chặn trước khi tra tài khoản, cùng một câu cho mọi email: không lộ email nào có tài khoản.
        const typedEmail = ctx.path === "/sign-in/username" && typeof ctx.body?.username === "string" && ctx.body.username.includes("@");
        if (ctx.path === "/sign-in/email" || typedEmail) {
          throw new APIError("UNAUTHORIZED", { message: AUTH_ERROR.USE_LOGIN_CODE, code: "USE_LOGIN_CODE" });
        }
        if (ctx.path === "/sign-in/username") {
          const loginName = signInLoginName(ctx.body);
          // Kiểm trước khi so mật khẩu: đang khóa tạm thì kể cả đúng mật khẩu cũng không biết được là đúng.
          if (loginName && (await reserveSignInAttempt(database, loginName))) {
            throw new APIError("TOO_MANY_REQUESTS", { message: AUTH_ERROR.SIGN_IN_LOCKED, code: "SIGN_IN_LOCKED" });
          }
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        const failed = isAPIError(ctx.context.returned);
        if (ctx.path === "/sign-in/username") {
          const loginName = signInLoginName(ctx.body);
          if (!loginName) return;
          if (!failed) return clearSignInFailures(database, [loginName]);
          const error = ctx.context.returned as APIError;
          if (error.body?.code !== "INVALID_USERNAME_OR_PASSWORD" || !(await lockIfTooManyFailures(database, loginName))) return;
          // Không ghi mật khẩu; tên đăng nhập có thể không tồn tại (dò bừa) nên không ghi vào nhật ký thao tác của tài khoản nào.
          console.warn(
            `[auth] Tạm khóa đăng nhập "${formatLoginName(loginName)}" ${SIGN_IN_LOCKOUT.lockMinutes} phút sau ${SIGN_IN_LOCKOUT.maxFailures} lần sai, IP ${(ctx.headers && clientIpFrom(ctx.headers)) ?? "không rõ"}`,
          );
          return;
        }
        // Đặt lại mật khẩu thành công (qua mã gửi email) thì gỡ khóa tạm để chủ tài khoản vào được ngay.
        if (ctx.path === "/email-otp/reset-password" && !failed && typeof ctx.body?.email === "string") {
          const [row] = await database.select({ username: user.username }).from(user).where(eq(user.email, ctx.body.email.toLowerCase()));
          if (row?.username) await clearSignInFailures(database, [row.username]);
        }
      }),
    },
    plugins: [
      username({
        // MSSV nhận cả "50.01.104.013" lẫn "5001104013", tra theo 10 chữ số; mã cán bộ, giảng viên tra theo chữ thường ("gv104011").
        usernameNormalization: normalizeLoginName,
        displayUsernameNormalization: formatLoginName,
        // Plugin kiểm độ dài và validator trên chuỗi chưa chuẩn hoá ở endpoint đăng nhập, nên validator tự chuẩn hoá.
        usernameValidator: isLoginName,
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
}

export const auth = createAuth(db);

export type AuthSession = typeof auth.$Infer.Session;
