import type { Rule } from "antd/es/form";
import { safeInternalPath } from "@/shared/constants/role.constant";

export const EMAIL_RULES: Rule[] = [
  { required: true, message: "Chưa nhập email" },
  { type: "email", message: "Email cần có dấu @ và tên miền" },
];

export const NEW_PASSWORD_RULES: Rule[] = [
  { required: true, message: "Chưa nhập mật khẩu" },
  { min: 8, message: "Mật khẩu cần ít nhất 8 ký tự" },
];

export const OTP_RULES: Rule[] = [
  { required: true, message: "Chưa nhập mã" },
  { len: 6, message: "Mã gồm đủ 6 số" },
];

export const AUTH_COOKIE_PREFIX = "hcmue";

export const AUTH_PATHNAME_HEADER = "x-hcmue-pathname";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export const SIGN_IN_LOCKOUT = { maxFailures: 10, windowMinutes: 15, lockMinutes: 15 } as const;

export const LOGIN_NAME_HINT = "Sinh viên nhập mã số sinh viên, ví dụ 50.01.104.013. Cán bộ, giảng viên nhập mã số của mình, ví dụ GV104011";

export const AUTH_ERROR = {
  USE_LOGIN_CODE: "Đăng nhập bằng mã số sinh viên hoặc mã số cán bộ, giảng viên",
  ACCOUNT_LOCKED: "Tài khoản đang bị khóa. Liên hệ Phòng Đào tạo để được mở khóa.",
  SIGN_IN_LOCKED: `Đăng nhập sai quá nhiều lần nên tạm khóa ${SIGN_IN_LOCKOUT.lockMinutes} phút. Thử lại sau, hoặc đặt lại mật khẩu qua Quên mật khẩu.`,
} as const;

const INVALID_LOGIN_NAME = "Tên đăng nhập là mã số sinh viên (ví dụ 50.01.104.013) hoặc mã số cán bộ, giảng viên (ví dụ GV104011)";

export const AUTH_ERROR_MESSAGE: Record<string, string> = {
  INVALID_USERNAME_OR_PASSWORD: "Sai tên đăng nhập hoặc mật khẩu",
  INVALID_EMAIL_OR_PASSWORD: "Sai tên đăng nhập hoặc mật khẩu",
  INVALID_USERNAME: INVALID_LOGIN_NAME,
  USERNAME_TOO_SHORT: INVALID_LOGIN_NAME,
  USERNAME_TOO_LONG: INVALID_LOGIN_NAME,
  INVALID_EMAIL: "Email chưa đúng định dạng",
  USE_LOGIN_CODE: AUTH_ERROR.USE_LOGIN_CODE,
  SIGN_IN_LOCKED: AUTH_ERROR.SIGN_IN_LOCKED,
  BANNED_USER: AUTH_ERROR.ACCOUNT_LOCKED,
  INVALID_OTP: "Mã không đúng",
  OTP_EXPIRED: "Mã đã hết hạn, bấm gửi lại mã",
  TOO_MANY_ATTEMPTS: "Nhập sai quá nhiều lần, bấm gửi lại mã",
  USER_NOT_FOUND: "Mã không đúng",
  INVALID_PASSWORD: "Mật khẩu hiện tại không đúng",
  PASSWORD_TOO_SHORT: "Mật khẩu cần ít nhất 8 ký tự",
  PASSWORD_TOO_LONG: "Mật khẩu tối đa 128 ký tự",
};

export const AUTH_FALLBACK_ERROR = "Chưa thực hiện được, thử lại sau ít phút";

export const AUTH_RATE_LIMITED = "Thử quá nhiều lần, đợi một phút rồi thử lại";

export function authErrorMessage(error: { code?: string; status?: number } | null | undefined) {
  if (!error) return AUTH_FALLBACK_ERROR;
  if (error.code === "SIGN_IN_LOCKED") return AUTH_ERROR.SIGN_IN_LOCKED;
  if (error.status === 429) return AUTH_RATE_LIMITED;
  return (error.code && AUTH_ERROR_MESSAGE[error.code]) || AUTH_FALLBACK_ERROR;
}

export function safeNextPath(next: string | null | undefined) {
  return safeInternalPath(next);
}
