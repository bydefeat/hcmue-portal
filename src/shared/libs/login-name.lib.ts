import { formatStudentCode, isStudentCode, normalizeStudentCode } from "@/shared/libs/student-code.lib";

// Tên đăng nhập là mã số: sinh viên dùng MSSV (lưu 10 chữ số), giảng viên và cán bộ dùng mã hồ sơ như GV104011, CB0021
// (lưu chữ thường "gv104011", hiển thị chữ hoa). Không phân biệt hoa thường, bỏ khoảng trắng.
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

// Tài khoản giảng viên, cán bộ: username chữ thường để tra, displayUsername đúng như mã in trên hồ sơ.
export function staffAccountIdentity(code: string) {
  return { username: normalizeLoginName(code), displayUsername: formatLoginName(code) };
}
