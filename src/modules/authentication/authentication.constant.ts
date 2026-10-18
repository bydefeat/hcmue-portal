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
