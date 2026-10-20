import { z } from "zod";
import type { AccountStatus, StudentFormValues } from "@/modules/users/users.type";
import { formatLoginName, isStaffCode, STAFF_CODE_HINT } from "@/shared/libs/login-name.lib";
import { formatStudentCode, isStudentCode, isStudentEmail, normalizeStudentCode, studentEmailOf } from "@/shared/libs/student-code.lib";

export const IMPORT_COLUMNS = ["Mã sinh viên", "Họ và tên", "Giới tính", "Ngày sinh", "Email", "Điện thoại", "Mã ngành", "Khóa", "Lớp"] as const;

export type ImportRow = {
  line: number;
  cells: string[];
};

export type ImportResult = {
  line: number;
  values: StudentFormValues | null;
  raw: string[];
  errors: string[];
};

// Danh mục để đối chiếu dòng nhập: mã ngành có trong DB và các khóa đang nhận (page đọc từ DB rồi truyền xuống).
export type ImportCatalog = {
  majorCodes: string[];
  cohorts: number[];
};

const DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function validateImportRow(row: ImportRow, existingCodes: Set<string>, seenCodes: Set<string>, catalog: ImportCatalog): ImportResult {
  const [rawCode = "", fullName = "", gender = "", dateOfBirth = "", email = "", phone = "", majorCode = "", cohort = "", className = ""] = row.cells.map((cell) =>
    cell.trim(),
  );
  // Nhận cả "51.01.104.201" lẫn "5101104201"; existingCodes, seenCodes so theo 10 chữ số.
  const digits = normalizeStudentCode(rawCode);
  const code = formatStudentCode(digits);
  const errors: string[] = [];
  if (!isStudentCode(digits)) errors.push("Mã sinh viên phải gồm đúng 10 chữ số");
  else if (existingCodes.has(digits)) errors.push(`Mã ${code} đã có trong hệ thống, dòng bị bỏ qua`);
  else if (seenCodes.has(digits)) errors.push(`Mã ${code} lặp lại với một dòng phía trên`);
  if (!fullName) errors.push("Thiếu họ và tên");
  if (!["Nam", "Nữ"].includes(gender)) errors.push("Giới tính ghi Nam hoặc Nữ");
  const date = DATE_PATTERN.exec(dateOfBirth);
  if (!date) errors.push("Ngày sinh theo dạng dd/mm/yyyy");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push("Email sai định dạng");
  if (phone && !/^0\d{9}$/.test(phone)) errors.push("Điện thoại gồm 10 số, bắt đầu bằng 0");
  const hasMajor = catalog.majorCodes.includes(majorCode);
  if (!hasMajor) errors.push(`Mã ngành ${majorCode || "(trống)"} không có trong danh mục`);
  const cohortNumber = Number(cohort);
  if (!catalog.cohorts.includes(cohortNumber)) errors.push(`Khóa ${cohort || "(trống)"} không đang tuyển sinh`);
  if (!className) errors.push("Thiếu lớp sinh hoạt");
  if (isStudentCode(digits)) seenCodes.add(digits);

  if (errors.length > 0 || !date || !hasMajor) return { line: row.line, values: null, raw: row.cells, errors };
  return {
    line: row.line,
    raw: row.cells,
    errors,
    values: {
      code,
      fullName,
      gender: gender === "Nữ" ? "female" : "male",
      dateOfBirth: `${date[3]}-${date[2]}-${date[1]}`,
      email: email || studentEmailOf(digits),
      phone,
      majorCode,
      cohort: cohortNumber,
      className,
      status: "studying",
    },
  };
}

export function templateCsv() {
  const sample = [
    ["5101104201", "Nguyễn Văn An", "Nam", "15/03/2007", "", "0901234567", "104", "51", "51.01.CNTT.A"],
    ["5101101202", "Trần Thị Bình", "Nữ", "02/11/2007", "", "", "101", "51", "51.01.TOAN.B"],
  ];
  return [IMPORT_COLUMNS.join(","), ...sample.map((line) => line.join(","))].join("\n");
}

const PHONE = /^0\d{9}$/;
const optionalPhone = z.string().trim().refine((value) => value === "" || PHONE.test(value.replace(/\s/g, "")), "Số điện thoại gồm 10 số, bắt đầu bằng 0");
const optionalEmail = z.string().trim().refine((value) => value === "" || z.email().safeParse(value).success, "Email cần có dấu @ và tên miền");

// Hồ sơ sinh viên do Phòng Đào tạo nhập; MSSV lưu 10 chữ số, lớp sinh hoạt tự tạo nếu chưa có.
export const STUDENT_SCHEMA = z.object({
  code: z
    .string()
    .trim()
    .transform(normalizeStudentCode)
    .pipe(z.string().regex(/^\d{10}$/, "Mã sinh viên gồm 10 chữ số, ví dụ 49.01.104.012")),
  fullName: z.string().trim().min(1, "Chưa nhập họ và tên").max(120),
  gender: z.enum(["female", "male"]),
  dateOfBirth: z.iso.date("Ngày sinh không hợp lệ"),
  email: optionalEmail,
  phone: optionalPhone,
  majorCode: z.string().trim().min(1, "Chưa chọn ngành"),
  cohort: z.int().min(1).max(99),
  className: z.string().trim().min(1, "Chưa nhập lớp sinh hoạt").max(40),
  status: z.enum(["studying", "reserved", "suspended", "graduated"]),
});

export type StudentInput = z.input<typeof STUDENT_SCHEMA>;

export const LECTURER_SCHEMA = z.object({
  // Mã giảng viên cũng là tên đăng nhập nên phải đúng dạng plugin username nhận (login-name.lib).
  code: z.string().trim().toUpperCase().min(1, "Chưa nhập mã giảng viên").refine(isStoredStaffCode, STAFF_CODE_HINT),
  fullName: z.string().trim().min(1, "Chưa nhập họ và tên").max(120),
  gender: z.enum(["female", "male"], "Chưa chọn giới tính"),
  title: z.string().trim().min(1, "Chưa chọn học hàm, học vị").max(20),
  faculty: z.string().trim().min(1, "Chưa chọn khoa"),
  email: z.string().trim().toLowerCase().pipe(z.email("Email không hợp lệ")).refine((value) => value.endsWith("@hcmue.edu.vn"), "Dùng email công vụ có đuôi @hcmue.edu.vn"),
  phone: optionalPhone,
  status: z.enum(["active", "on-leave"]),
});

export type LecturerInput = z.input<typeof LECTURER_SCHEMA>;

export const STUDENT_CONTACT_SCHEMA = z.object({
  personalEmail: optionalEmail,
  phone: z.string().trim().regex(PHONE, "Số điện thoại gồm 10 chữ số, bắt đầu bằng 0"),
  address: z.string().trim().max(300),
  emergencyName: z.string().trim().max(120),
  emergencyPhone: optionalPhone,
});

export type StudentContactInput = z.input<typeof STUDENT_CONTACT_SCHEMA>;

export const LECTURER_CONTACT_SCHEMA = z.object({
  phone: z.string().trim().regex(PHONE, "Số điện thoại gồm 10 chữ số, bắt đầu bằng 0"),
  personalEmail: optionalEmail,
  office: z.string().trim().max(200),
  officeHours: z.string().trim().max(200),
});

export type LecturerContactInput = z.input<typeof LECTURER_CONTACT_SCHEMA>;

export const DECISION_SCHEMA = z.object({
  studentId: z.uuid("Chưa chọn sinh viên"),
  kind: z.enum(["reserve", "resume", "suspend", "expel", "major-change", "reward", "discipline", "graduate"]),
  title: z.string().trim().min(1, "Chưa nhập nội dung").max(300),
  basis: z.string().trim().min(1, "Chưa nhập căn cứ").max(500),
  effectiveDate: z.iso.date("Chưa chọn ngày"),
});

export type DecisionInput = z.input<typeof DECISION_SCHEMA>;

// Mã lưu đúng như tên đăng nhập hiển thị (chữ hoa, không khoảng trắng), để đổi qua lại username không lệch.
function isStoredStaffCode(value: string) {
  return isStaffCode(value) && formatLoginName(value) === value;
}

// Tài khoản sinh viên: đăng nhập bằng MSSV 10 chữ số, hiển thị dạng có dấu chấm, email trường nhận mã kích hoạt.
export function studentAccountIdentity(code: string) {
  const username = normalizeStudentCode(code);
  return { username, displayUsername: formatStudentCode(username), email: studentEmailOf(username) };
}

export function accountStatusOf(account: { userId: string | null; banned: boolean | null; lastSignInAt: Date | string | null }): AccountStatus {
  if (!account.userId) return "none";
  if (account.banned) return "locked";
  return account.lastSignInAt ? "active" : "pending";
}

// Đường dẫn trong thư kích hoạt: trang quên mật khẩu điền sẵn email, người nhận lấy mã OTP rồi tự đặt mật khẩu.
export function activationLink(baseUrl: string, email: string) {
  return `${baseUrl.replace(/\/+$/, "")}/authentication/forgot-password?email=${encodeURIComponent(email)}&activate=1`;
}

export function activationMail(account: { name: string; loginName: string; isStudent: boolean; link: string }) {
  const loginHint = account.isStudent ? `Tên đăng nhập là mã số sinh viên: ${account.loginName}` : `Tên đăng nhập là mã số cán bộ, giảng viên: ${account.loginName}`;
  return {
    subject: "Kích hoạt tài khoản HCMUE Portal",
    text: [
      `Chào ${account.name},`,
      `Phòng Đào tạo đã cấp cho bạn tài khoản HCMUE Portal. ${loginHint}.`,
      `Để kích hoạt, mở đường dẫn dưới đây, bấm Gửi mã, nhập mã gồm 6 số được gửi tới email này rồi đặt mật khẩu của bạn:\n${account.link}`,
      `Sau đó đăng nhập bằng tên đăng nhập ${account.loginName} (không dùng email) và mật khẩu vừa đặt.`,
      "Nếu bạn không phải người nhận thư này, bỏ qua thư; tài khoản chưa dùng được khi chưa đặt mật khẩu.",
    ].join("\n\n"),
  };
}

export const ACCOUNT_BATCH_SCHEMA = z.object({
  kind: z.enum(["student", "lecturer"]),
  ids: z
    .array(z.uuid())
    .min(1, "Chưa chọn hồ sơ")
    .max(1000, "Mỗi lần tối đa 1000 hồ sơ")
    .transform((ids) => [...new Set(ids)]),
});

export type AccountBatchInput = z.input<typeof ACCOUNT_BATCH_SCHEMA>;

// Cán bộ do quản trị hệ thống tạo ở trang Phân quyền; đăng nhập bằng mã cán bộ, email công vụ nhận mã kích hoạt.
export const STAFF_SCHEMA = z.object({
  code: z.string().trim().toUpperCase().min(1, "Chưa nhập mã cán bộ").refine(isStoredStaffCode, STAFF_CODE_HINT),
  fullName: z.string().trim().min(1, "Chưa nhập họ và tên").max(120),
  unit: z.string().trim().min(1, "Chưa nhập đơn vị").max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Email không hợp lệ"))
    .refine((value) => value.endsWith("@hcmue.edu.vn") && !isStudentEmail(value), "Dùng email công vụ có đuôi @hcmue.edu.vn"),
  provisionAccount: z.boolean().default(true),
});

export type StaffInput = z.input<typeof STAFF_SCHEMA>;

export type AccountBatchAction = "provision" | "resend" | "lock" | "unlock";

// Câu báo sau thao tác hàng loạt: số đã làm, số thư đã xếp gửi, số dòng bỏ qua gom theo lý do.
export function accountBatchSummary(action: AccountBatchAction, result: { changed: number; mailed: number; skipped: { reason: string }[] }) {
  const head = {
    provision: `Đã cấp ${result.changed} tài khoản, gửi thư kích hoạt tới ${result.mailed} người`,
    resend: `Đã gửi lại thư kích hoạt tới ${result.mailed} người`,
    lock: `Đã khóa ${result.changed} tài khoản và đăng xuất khỏi mọi thiết bị`,
    unlock: `Đã mở khóa ${result.changed} tài khoản`,
  }[action];
  const parts = [head];
  if (result.skipped.length > 0) {
    const byReason = new Map<string, number>();
    for (const entry of result.skipped) byReason.set(entry.reason, (byReason.get(entry.reason) ?? 0) + 1);
    parts.push(`bỏ qua ${[...byReason].map(([reason, total]) => `${total} hồ sơ ${reason.charAt(0).toLowerCase()}${reason.slice(1)}`).join(", ")}`);
  }
  return `${parts.join("; ")}.`;
}
