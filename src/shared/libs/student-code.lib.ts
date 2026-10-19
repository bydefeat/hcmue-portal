// Mã số sinh viên lưu 10 chữ số liền ("5001104013"), hiển thị theo thẻ sinh viên ("50.01.104.013").
export const STUDENT_EMAIL_DOMAIN = "student.hcmue.edu.vn";

const STUDENT_CODE = /^\d{10}$/;

export function normalizeStudentCode(input: string) {
  return input.replace(/[\s.]/g, "");
}

export function isStudentCode(input: string) {
  return STUDENT_CODE.test(normalizeStudentCode(input));
}

export function formatStudentCode(code: string) {
  const digits = normalizeStudentCode(code);
  return STUDENT_CODE.test(digits) ? `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4, 7)}.${digits.slice(7)}` : code;
}

export function studentEmailOf(code: string) {
  return `${normalizeStudentCode(code)}@${STUDENT_EMAIL_DOMAIN}`;
}

export function isStudentEmail(email: string) {
  return email.trim().toLowerCase().endsWith(`@${STUDENT_EMAIL_DOMAIN}`);
}
