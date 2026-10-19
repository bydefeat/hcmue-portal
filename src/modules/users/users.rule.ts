import { z } from "zod";
import { MOCK_COHORTS, MOCK_MAJORS } from "@/shared/libs/mock.lib";
import type { StudentFormValues } from "@/modules/users/users.type";
import { formatStudentCode, isStudentCode, normalizeStudentCode, studentEmailOf } from "@/shared/libs/student-code.lib";

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

const DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function validateImportRow(row: ImportRow, existingCodes: Set<string>, seenCodes: Set<string>): ImportResult {
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
  const major = MOCK_MAJORS.find((entry) => entry.code === majorCode);
  if (!major) errors.push(`Mã ngành ${majorCode || "(trống)"} không có trong danh mục`);
  const cohortNumber = Number(cohort);
  if (!MOCK_COHORTS.includes(cohortNumber as (typeof MOCK_COHORTS)[number])) errors.push(`Khóa ${cohort || "(trống)"} không đang tuyển sinh`);
  if (!className) errors.push("Thiếu lớp sinh hoạt");
  if (isStudentCode(digits)) seenCodes.add(digits);

  if (errors.length > 0 || !date || !major) return { line: row.line, values: null, raw: row.cells, errors };
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
  code: z.string().trim().toUpperCase().min(1, "Chưa nhập mã giảng viên").max(20),
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
