import { z } from "zod";
import type { AccountStatus, DecisionKind, DisciplineLevel, StudentFormValues, StudentStatus } from "@/modules/users/users.type";
import { formatLoginName, isStaffCode, STAFF_CODE_HINT } from "@/shared/libs/login-name.lib";
import { formatStudentCode, isStudentCode, isStudentEmail, normalizeStudentCode, studentEmailOf } from "@/shared/libs/student-code.lib";

export const IMPORT_COLUMNS = ["Mã sinh viên", "Họ và tên", "Giới tính", "Ngày sinh", "Email cá nhân", "Điện thoại", "Mã ngành", "Khóa", "Lớp"] as const;

export const PHONE_MESSAGE = "Số điện thoại gồm 10 chữ số, bắt đầu bằng 0";
export const EMAIL_MESSAGE = "Email cần có dấu @ và tên miền";
export const OFFICIAL_EMAIL_MESSAGE = "Dùng email công vụ có đuôi @hcmue.edu.vn";
export const PERSONAL_EMAIL_MESSAGE = "Email cá nhân không dùng email trường";
const PHONE = /^0\d{9}$/;

export function normalizePhone(value: string) {
  return value.replace(/[\s.-]/g, "");
}

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

export type ImportCatalog = {
  majorCodes: string[];
  cohorts: number[];
};

const DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function validateImportRow(row: ImportRow, existingCodes: Set<string>, seenCodes: Set<string>, catalog: ImportCatalog): ImportResult {
  const [rawCode = "", fullName = "", gender = "", dateOfBirth = "", email = "", phone = "", majorCode = "", cohort = "", className = ""] = row.cells.map((cell) =>
    cell.trim(),
  );
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
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push(EMAIL_MESSAGE);
  else if (email && isStudentEmail(email)) errors.push(`${PERSONAL_EMAIL_MESSAGE}; email trường tự sinh theo mã sinh viên`);
  if (phone && !PHONE.test(normalizePhone(phone))) errors.push(PHONE_MESSAGE);
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
      personalEmail: email.toLowerCase(),
      phone: normalizePhone(phone),
      majorCode,
      cohort: cohortNumber,
      className,
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

const optionalPhone = z
  .string()
  .trim()
  .transform(normalizePhone)
  .refine((value) => value === "" || PHONE.test(value), PHONE_MESSAGE);
const requiredPhone = z.string().trim().transform(normalizePhone).pipe(z.string().regex(PHONE, PHONE_MESSAGE));
const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .refine((value) => value === "" || z.email().safeParse(value).success, EMAIL_MESSAGE);
const personalEmail = optionalEmail.refine((value) => !isStudentEmail(value), PERSONAL_EMAIL_MESSAGE);
const officialEmail = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email(EMAIL_MESSAGE))
  .refine((value) => value.endsWith("@hcmue.edu.vn") && !isStudentEmail(value), OFFICIAL_EMAIL_MESSAGE);

export const STUDENT_SCHEMA = z.object({
  code: z
    .string()
    .trim()
    .transform(normalizeStudentCode)
    .pipe(z.string().regex(/^\d{10}$/, "Mã sinh viên gồm 10 chữ số, ví dụ 49.01.104.012")),
  fullName: z.string().trim().min(1, "Chưa nhập họ và tên").max(120),
  gender: z.enum(["female", "male"]),
  dateOfBirth: z.iso.date("Ngày sinh không hợp lệ"),
  personalEmail,
  phone: optionalPhone,
  majorCode: z.string().trim().min(1, "Chưa chọn ngành"),
  cohort: z.int().min(1).max(99),
  className: z.string().trim().min(1, "Chưa nhập lớp sinh hoạt").max(40),
});

export type StudentInput = z.input<typeof STUDENT_SCHEMA>;

export const LECTURER_SCHEMA = z.object({
  code: z.string().trim().toUpperCase().min(1, "Chưa nhập mã giảng viên").refine(isStoredStaffCode, STAFF_CODE_HINT),
  fullName: z.string().trim().min(1, "Chưa nhập họ và tên").max(120),
  gender: z.enum(["female", "male"], "Chưa chọn giới tính"),
  title: z.string().trim().min(1, "Chưa chọn học hàm, học vị").max(20),
  faculty: z.string().trim().min(1, "Chưa chọn khoa"),
  email: officialEmail,
  phone: optionalPhone,
  status: z.enum(["active", "on-leave"]),
});

export type LecturerInput = z.input<typeof LECTURER_SCHEMA>;

export const STUDENT_CONTACT_SCHEMA = z.object({
  personalEmail,
  phone: requiredPhone,
  address: z.string().trim().max(300),
  emergencyName: z.string().trim().max(120),
  emergencyPhone: optionalPhone,
});

export type StudentContactInput = z.input<typeof STUDENT_CONTACT_SCHEMA>;

export const LECTURER_CONTACT_SCHEMA = z.object({
  phone: requiredPhone,
  personalEmail,
  office: z.string().trim().max(200),
  officeHours: z.string().trim().max(200),
});

export type LecturerContactInput = z.input<typeof LECTURER_CONTACT_SCHEMA>;

export const DECISION_SCHEMA = z
  .object({
    studentId: z.uuid("Chưa chọn sinh viên"),
    kind: z.enum(["reserve", "resume", "suspend", "expel", "major-change", "reward", "discipline", "graduate"], "Chưa chọn loại quyết định"),
    title: z.string().trim().min(1, "Chưa nhập nội dung").max(300),
    basis: z.string().trim().min(1, "Chưa nhập căn cứ").max(500),
    effectiveDate: z.iso.date("Chưa chọn ngày"),
    disciplineLevel: z.enum(["reprimand", "warning", "suspension"]).nullish(),
    targetClassName: z.string().trim().max(40).nullish(),
  })
  .superRefine((value, context) => {
    if (value.kind === "discipline" && !value.disciplineLevel) context.addIssue({ code: "custom", path: ["disciplineLevel"], message: "Chưa chọn hình thức kỷ luật" });
    if (value.kind === "major-change" && !value.targetClassName) context.addIssue({ code: "custom", path: ["targetClassName"], message: "Chưa chọn lớp sinh hoạt của ngành mới" });
  })
  .transform((value) => ({
    ...value,
    disciplineLevel: value.kind === "discipline" ? (value.disciplineLevel ?? null) : null,
    targetClassName: value.kind === "major-change" ? (value.targetClassName ?? null) : null,
  }));

export const DECISION_REASON_SCHEMA = z.object({ id: z.uuid("Quyết định không còn tồn tại, tải lại trang."), reason: z.string().trim().min(1, "Chưa ghi lý do").max(500) });

type DecisionEffect = { from: StudentStatus[]; to: StudentStatus | null };

export function decisionEffect(kind: DecisionKind, level: DisciplineLevel | null = null): DecisionEffect {
  switch (kind) {
    case "reserve":
      return { from: ["studying"], to: "reserved" };
    case "resume":
      return { from: ["reserved", "suspended"], to: "studying" };
    case "suspend":
      return { from: ["studying"], to: "suspended" };
    case "expel":
      return { from: ["studying", "reserved", "suspended"], to: "withdrawn" };
    case "major-change":
      return { from: ["studying", "reserved"], to: null };
    case "reward":
      return { from: ["studying", "reserved", "suspended", "graduated"], to: null };
    case "discipline":
      return level === "suspension" ? { from: ["studying"], to: "suspended" } : { from: ["studying", "reserved", "suspended"], to: null };
    case "graduate":
      return { from: ["studying"], to: "graduated" };
  }
}

export function changesProfile(kind: DecisionKind, level: DisciplineLevel | null = null) {
  return kind === "major-change" || decisionEffect(kind, level).to !== null;
}

const STATUS_PHRASE: Record<StudentStatus, string> = {
  studying: "đang học",
  reserved: "đang bảo lưu",
  suspended: "đang tạm ngừng học",
  graduated: "đã tốt nghiệp",
  withdrawn: "đã thôi học",
};

const KIND_PHRASE: Record<DecisionKind, string> = {
  reserve: "bảo lưu kết quả học tập",
  resume: "tiếp tục học",
  suspend: "tạm ngừng học",
  expel: "buộc thôi học",
  "major-change": "chuyển ngành",
  reward: "khen thưởng",
  discipline: "kỷ luật",
  graduate: "công nhận tốt nghiệp",
};

export function decisionBlockedReason(kind: DecisionKind, status: StudentStatus, level: DisciplineLevel | null = null) {
  if (decisionEffect(kind, level).from.includes(status)) return null;
  return `Sinh viên ${STATUS_PHRASE[status]} nên không lập được quyết định ${KIND_PHRASE[kind]}.`;
}

export function revokeBlockedReason(
  decision: { kind: DecisionKind; disciplineLevel: DisciplineLevel | null; appliedAt: unknown; targetClassId: string | null },
  student: { status: StudentStatus; administrativeClassId: string },
) {
  if (!decision.appliedAt) return null;
  const { to } = decisionEffect(decision.kind, decision.disciplineLevel);
  if (to && student.status !== to) {
    return `Tình trạng của sinh viên đã đổi sang "${STATUS_PHRASE[student.status]}" sau quyết định này. Thu hồi quyết định đổi tình trạng sau trước.`;
  }
  if (decision.kind === "major-change" && student.administrativeClassId !== decision.targetClassId) {
    return "Sinh viên đã chuyển sang lớp khác sau quyết định này. Thu hồi quyết định chuyển lớp sau trước.";
  }
  return null;
}

export const STATUS_OVERRIDE_SCHEMA = z.object({
  ids: z.array(z.uuid()).min(1, "Chưa chọn sinh viên").max(1000),
  status: z.enum(["studying", "reserved", "suspended", "graduated", "withdrawn"], "Chưa chọn tình trạng"),
  reason: z.string().trim().min(10, "Ghi lý do sửa tình trạng, ít nhất 10 ký tự, ví dụ số quyết định giấy").max(500),
});

export type StatusOverrideInput = z.input<typeof STATUS_OVERRIDE_SCHEMA>;

export type DecisionInput = z.input<typeof DECISION_SCHEMA>;

function isStoredStaffCode(value: string) {
  return isStaffCode(value) && formatLoginName(value) === value;
}

export function studentAccountIdentity(code: string) {
  const username = normalizeStudentCode(code);
  return { username, displayUsername: formatStudentCode(username), email: studentEmailOf(username) };
}

export function accountStatusOf(account: { userId: string | null; banned: boolean | null; lastSignInAt: Date | string | null }): AccountStatus {
  if (!account.userId) return "none";
  if (account.banned) return "locked";
  return account.lastSignInAt ? "active" : "pending";
}

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
  kind: z.enum(["student", "lecturer", "staff"]),
  ids: z
    .array(z.uuid())
    .min(1, "Chưa chọn hồ sơ")
    .max(1000, "Mỗi lần tối đa 1000 hồ sơ")
    .transform((ids) => [...new Set(ids)]),
});

export type AccountBatchInput = z.input<typeof ACCOUNT_BATCH_SCHEMA>;

export const STAFF_SCHEMA = z.object({
  code: z.string().trim().toUpperCase().min(1, "Chưa nhập mã cán bộ").refine(isStoredStaffCode, STAFF_CODE_HINT),
  fullName: z.string().trim().min(1, "Chưa nhập họ và tên").max(120),
  unit: z.string().trim().min(1, "Chưa nhập đơn vị").max(120),
  email: officialEmail,
  provisionAccount: z.boolean().default(true),
  roleId: z.uuid("Vai trò không hợp lệ").nullish(),
  faculty: z.string().trim().nullish(),
});

export const STAFF_UPDATE_SCHEMA = STAFF_SCHEMA.pick({ fullName: true, unit: true, email: true });

export type StaffUpdateInput = z.input<typeof STAFF_UPDATE_SCHEMA>;

export type StaffInput = z.input<typeof STAFF_SCHEMA>;

export type AccountBatchAction = "provision" | "resend" | "lock" | "unlock";

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
