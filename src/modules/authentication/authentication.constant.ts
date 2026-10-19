import type { Rule } from "antd/es/form";

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

// proxy.ts gắn đường dẫn đang mở vào header này để layout dựng được ?next= khi phiên đã hết hạn.
export const AUTH_PATHNAME_HEADER = "x-hcmue-pathname";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export const AUTH_ERROR = {
  STUDENT_USE_CODE: "Sinh viên đăng nhập bằng mã số sinh viên, không dùng email",
} as const;

// Mã lỗi better-auth trả về → câu hiển thị. Sai tên đăng nhập hay sai mật khẩu dùng chung một câu để không lộ tài khoản nào tồn tại.
export const AUTH_ERROR_MESSAGE: Record<string, string> = {
  INVALID_USERNAME_OR_PASSWORD: "Sai tên đăng nhập hoặc mật khẩu",
  INVALID_EMAIL_OR_PASSWORD: "Sai tên đăng nhập hoặc mật khẩu",
  INVALID_USERNAME: "Mã số sinh viên gồm 10 chữ số, ví dụ 50.01.104.013",
  USERNAME_TOO_SHORT: "Mã số sinh viên gồm 10 chữ số, ví dụ 50.01.104.013",
  USERNAME_TOO_LONG: "Mã số sinh viên gồm 10 chữ số, ví dụ 50.01.104.013",
  INVALID_EMAIL: "Email chưa đúng định dạng",
  STUDENT_USE_CODE: AUTH_ERROR.STUDENT_USE_CODE,
  BANNED_USER: "Tài khoản đang bị khoá, liên hệ Phòng Đào tạo",
  INVALID_OTP: "Mã không đúng",
  OTP_EXPIRED: "Mã đã hết hạn, bấm gửi lại mã",
  TOO_MANY_ATTEMPTS: "Nhập sai quá nhiều lần, bấm gửi lại mã",
  USER_NOT_FOUND: "Mã không đúng",
  PASSWORD_TOO_SHORT: "Mật khẩu cần ít nhất 8 ký tự",
  PASSWORD_TOO_LONG: "Mật khẩu tối đa 128 ký tự",
};

export const AUTH_FALLBACK_ERROR = "Chưa thực hiện được, thử lại sau ít phút";

export const AUTH_RATE_LIMITED = "Thử quá nhiều lần, đợi một phút rồi thử lại";

export function authErrorMessage(error: { code?: string; status?: number } | null | undefined) {
  if (!error) return AUTH_FALLBACK_ERROR;
  if (error.status === 429) return AUTH_RATE_LIMITED;
  return (error.code && AUTH_ERROR_MESSAGE[error.code]) || AUTH_FALLBACK_ERROR;
}

// Chỉ nhận đường dẫn nội bộ, chặn chuyển hướng ra trang ngoài qua ?next=.
export function safeNextPath(next: string | null | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : null;
}
