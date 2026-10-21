import { formatStudentCode, isStudentCode, normalizeStudentCode } from "@/shared/libs/student-code.lib";

const STAFF_CODE = /^[a-z]{2,4}\d{3,8}$/;

export const STAFF_CODE_HINT = "Mã gồm 2 đến 4 chữ cái rồi 3 đến 8 chữ số, ví dụ GV104011";

export function isStaffCode(input: string) {
  return STAFF_CODE.test(input.replace(/\s/g, "").toLowerCase());
}

export function isLoginName(input: string) {
  return isStudentCode(input) || isStaffCode(input);
}

export function normalizeLoginName(input: string) {
  return isStudentCode(input) ? normalizeStudentCode(input) : input.replace(/\s/g, "").toLowerCase();
}

export function formatLoginName(input: string) {
  if (isStudentCode(input)) return formatStudentCode(input);
  return isStaffCode(input) ? input.replace(/\s/g, "").toUpperCase() : input;
}

export function staffAccountIdentity(code: string) {
  return { username: normalizeLoginName(code), displayUsername: formatLoginName(code) };
}
