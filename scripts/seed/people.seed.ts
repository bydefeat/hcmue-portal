import type { Transaction } from "@/shared/libs/db.lib";
import { schoolTime } from "@/shared/libs/date.lib";
import { mockDate, mockId } from "@/shared/libs/mock.lib";
import { staffAccountIdentity } from "@/shared/libs/login-name.lib";
import { formatStudentCode, normalizeStudentCode } from "@/shared/libs/student-code.lib";
import { ROLES } from "@/modules/access/access.mock";
import { roleAssignments, rolePermissions, roles } from "@/modules/access/access.schema";
import { account, user } from "@/modules/authentication/authentication.schema";
import { ADVISOR_ASSIGNMENTS, CURRENT_LECTURER_ID, CURRENT_STUDENT_ID, LECTURERS, STUDENTS } from "@/modules/users/users.mock";
import type { DecisionKind, DecisionStatus, DisciplineLevel, Student, StudentStatus } from "@/modules/users/users.type";
import { administrativeClasses, lecturerLoadNorms, lecturers, staffMembers, studentDecisions, students } from "@/modules/users/users.schema";
import { by, type SeedContext } from "./context";

export const ADMIN = { code: "CB0021", name: "Trần Minh Khoa", unit: "Phòng Đào tạo", email: "khoatm@hcmue.edu.vn" };
// Cán bộ Phòng Kế hoạch - Tài chính: chỉ có vai trò finance-office (học phí, khóa đăng ký học phí), để thử menu và quyền tuition.manage.
export const FINANCE = { code: "CB0034", name: "Nguyễn Thị Thu Hà", unit: "Phòng Kế hoạch - Tài chính", email: "hantt@hcmue.edu.vn" };

export const classIdOf = (className: string) => mockId(`class:${className}`);

// Tài khoản đăng nhập, giảng viên, cán bộ, lớp sinh hoạt, sinh viên, quyết định, vai trò quản trị.
export async function seedPeople(tx: Transaction, context: SeedContext) {
  const currentStudent = STUDENTS.find((student) => student.id === CURRENT_STUDENT_ID)!;
  const currentLecturer = LECTURERS.find((lecturer) => lecturer.id === CURRENT_LECTURER_ID)!;
  const studentCode = normalizeStudentCode(currentStudent.code);
  // Giảng viên, cán bộ đăng nhập bằng mã hồ sơ như sinh viên dùng MSSV.
  const lecturerLogin = staffAccountIdentity(currentLecturer.code);
  const adminLogin = staffAccountIdentity(ADMIN.code);
  const financeLogin = staffAccountIdentity(FINANCE.code);

  // Tài khoản seed coi như đã kích hoạt (đã đăng nhập) để bảng tài khoản hiện "Đang dùng"; hồ sơ khác để "Chưa cấp".
  const lastSignInAt = new Date();
  const userRows = await tx
    .insert(user)
    .values([
      {
        name: currentStudent.fullName,
        email: currentStudent.email,
        username: studentCode,
        displayUsername: formatStudentCode(studentCode),
        emailVerified: true,
        role: "student",
        lastSignInAt,
      },
      { name: currentLecturer.displayName, email: currentLecturer.email, ...lecturerLogin, emailVerified: true, role: "lecturer", lastSignInAt },
      { name: ADMIN.name, email: ADMIN.email, ...adminLogin, emailVerified: true, role: "admin", lastSignInAt },
      { name: FINANCE.name, email: FINANCE.email, ...financeLogin, emailVerified: true, role: "admin", lastSignInAt },
    ])
    .returning();
  const [studentUser, lecturerUser, adminUser, financeUser] = userRows;
  await tx.insert(account).values(userRows.map((row) => ({ userId: row.id, accountId: row.id, providerId: "credential", password: context.passwordHash })));
  Object.assign(context, { studentUserId: studentUser.id, lecturerUserId: lecturerUser.id, adminUserId: adminUser.id });

  await tx.insert(lecturers).values(
    LECTURERS.map((lecturer) => ({
      id: lecturer.id,
      userId: lecturer.id === currentLecturer.id ? lecturerUser.id : null,
      code: lecturer.code,
      fullName: lecturer.fullName,
      title: lecturer.title,
      gender: lecturer.gender,
      facultyId: context.facultyByName.get(lecturer.faculty)!.id,
      email: lecturer.email,
      phone: lecturer.phone,
      personalEmail: lecturer.personalEmail,
      office: lecturer.office,
      officeHours: lecturer.officeHours,
      status: lecturer.status,
    })),
  );
  await tx.insert(lecturerLoadNorms).values([
    { title: "ThS.", normHours: 135 },
    { title: "TS.", normHours: 135 },
    { title: "PGS.TS.", normHours: 120 },
    { title: "GS.TS.", normHours: 120 },
  ]);
  await tx.insert(staffMembers).values([
    { userId: adminUser.id, code: ADMIN.code, fullName: ADMIN.name, unit: ADMIN.unit, email: ADMIN.email },
    { userId: financeUser.id, code: FINANCE.code, fullName: FINANCE.name, unit: FINANCE.unit, email: FINANCE.email },
  ]);

  const firstStudentOf = by(STUDENTS.toReversed(), (student) => student.className);
  await tx.insert(administrativeClasses).values(
    ADVISOR_ASSIGNMENTS.map((assignment) => {
      const sample = firstStudentOf.get(assignment.className)!;
      return {
        id: classIdOf(assignment.className),
        code: assignment.className,
        majorId: context.majorByCode.get(sample.majorCode)!.id,
        cohort: assignment.cohort,
        advisorId: assignment.advisorId,
      };
    }),
  );

  await tx.insert(students).values(
    STUDENTS.map((student) => ({
      id: student.id,
      userId: student.id === currentStudent.id ? studentUser.id : null,
      code: normalizeStudentCode(student.code),
      fullName: student.fullName,
      gender: student.gender,
      dateOfBirth: student.dateOfBirth,
      email: student.email,
      phone: student.phone,
      hometown: student.hometown,
      administrativeClassId: classIdOf(student.className),
      status: student.status,
    })),
  );

  await tx.insert(studentDecisions).values(decisionSeeds(adminUser.id, `${ADMIN.name}, Trưởng phòng Đào tạo`));

  const roleRows = await tx
    .insert(roles)
    .values(ROLES.map(({ id, name, description, scope, isSystem }) => ({ key: id, name, description, scope, isSystem })))
    .returning();
  const roleByKey = by(roleRows, (row) => row.key);
  await tx.insert(rolePermissions).values(ROLES.flatMap((role) => role.permissions.map((permission) => ({ roleId: roleByKey.get(role.id)!.id, permission }))));
  // Tài khoản admin seed có 2 vai trò để thử đổi vai trò: Trưởng phòng Đào tạo (mặc định) và Quản trị hệ thống (có quyền Phân quyền).
  await tx.insert(roleAssignments).values({ userId: adminUser.id, roleId: roleByKey.get("academic-head")!.id, grantedByUserId: adminUser.id });
  await tx.insert(roleAssignments).values({ userId: adminUser.id, roleId: roleByKey.get("system-admin")!.id, grantedByUserId: adminUser.id });
  await tx.insert(roleAssignments).values({ userId: financeUser.id, roleId: roleByKey.get("finance-office")!.id, grantedByUserId: adminUser.id });

  return {
    students: STUDENTS.length,
    lecturers: LECTURERS.length,
    accounts: [
      `Sinh viên ${formatStudentCode(studentCode)} (${currentStudent.fullName})`,
      `Giảng viên ${lecturerLogin.displayUsername} (${currentLecturer.displayName})`,
      `Phòng Đào tạo ${adminLogin.displayUsername} (${ADMIN.name})`,
      `Phòng Kế hoạch - Tài chính ${financeLogin.displayUsername} (${FINANCE.name})`,
    ],
  };
}

type DecisionSeed = {
  student: Student;
  kind: DecisionKind;
  status: DecisionStatus;
  // Ngày ký so với hôm nay (âm là đã qua); hiệu lực mặc định 7 ngày sau ngày ký.
  daysAgo: number;
  title: string;
  basis: string;
  effectiveIn?: number;
  disciplineLevel?: DisciplineLevel;
  previousStatus?: StudentStatus;
  previousClassName?: string;
  revokeReason?: string;
};

const day = (offset: number) => schoolTime().add(offset, "day").format("YYYY-MM-DD");

// Quyết định mẫu khớp tình trạng sinh viên trong seed: mỗi sinh viên bảo lưu, tạm ngừng học có quyết định đã ký và đã có hiệu lực;
// quyết định chờ ký, dự thảo dành cho sinh viên đang học. Sinh viên đã tốt nghiệp khóa 48 được công nhận ở đợt xét trước
// (hồ sơ xét tốt nghiệp đã chốt), quyết định đợt đó không nhập lại vào hệ thống. Người ký là Trưởng phòng Đào tạo (có quyền ký).
function decisionSeeds(signerUserId: string, signerLabel: string) {
  const studying = STUDENTS.filter((student) => student.status === "studying" && student.id !== CURRENT_STUDENT_ID);
  let cursor = 0;
  const nextStudying = () => studying[(cursor += 37) % studying.length];
  const current = STUDENTS.find((student) => student.id === CURRENT_STUDENT_ID)!;
  // Sinh viên ngành Sư phạm Toán học chuyển từ lớp Sư phạm Vật lý cùng khóa.
  const transferred = studying.find((student) => student.majorCode === "101" && STUDENTS.some((other) => other.majorCode === "102" && other.cohort === student.cohort))!;
  const physicsClass = STUDENTS.find((other) => other.majorCode === "102" && other.cohort === transferred.cohort)!.className;

  const seeds: DecisionSeed[] = [
    { student: nextStudying(), kind: "reserve", status: "pending-signature", daysAgo: -1, title: "Bảo lưu kết quả học tập học kỳ 2, năm học 2026-2027", basis: "Đơn DT-2026-01255 đã qua cố vấn và khoa" },
    { student: nextStudying(), kind: "reserve", status: "draft", daysAgo: 0, title: "Bảo lưu kết quả học tập 2 học kỳ", basis: "Đơn DT-2026-01285, chờ Phòng Đào tạo hoàn thiện hồ sơ" },
    { student: nextStudying(), kind: "expel", status: "pending-signature", daysAgo: -3, title: "Buộc thôi học do bị cảnh báo học vụ mức 3", basis: "Kết quả xét học vụ học kỳ 2, năm học 2025-2026" },
    {
      student: transferred,
      kind: "major-change",
      status: "signed",
      daysAgo: -55,
      title: "Chuyển từ ngành Sư phạm Vật lý sang ngành Sư phạm Toán học",
      basis: "Đơn chuyển ngành, có ý kiến của hai khoa",
      previousStatus: "studying",
      previousClassName: physicsClass,
    },
    { student: current, kind: "reward", status: "signed", daysAgo: -60, title: "Khen thưởng sinh viên đạt thành tích học tập xuất sắc năm học 2025-2026", basis: "Danh sách xét khen thưởng toàn trường", previousStatus: "studying" },
    { student: nextStudying(), kind: "reward", status: "signed", daysAgo: -60, title: "Khen thưởng sinh viên đạt giải Olympic Toán học sinh viên", basis: "Giải Nhì Olympic Toán học sinh viên toàn quốc 2026", previousStatus: "studying" },
    {
      student: nextStudying(),
      kind: "discipline",
      status: "signed",
      daysAgo: -90,
      title: "Khiển trách do vi phạm quy chế thi",
      basis: "Biên bản vi phạm quy chế thi học kỳ 2",
      disciplineLevel: "reprimand",
      previousStatus: "studying",
    },
    { student: nextStudying(), kind: "resume", status: "signed", daysAgo: -25, title: "Tiếp tục học sau thời gian bảo lưu", basis: "Hết thời hạn bảo lưu 1 học kỳ", previousStatus: "reserved" },
    {
      student: nextStudying(),
      kind: "reserve",
      status: "revoked",
      daysAgo: -15,
      title: "Bảo lưu kết quả học tập học kỳ 1, năm học 2026-2027",
      basis: "Đơn xin bảo lưu của sinh viên",
      revokeReason: "Sinh viên rút đơn trước ngày quyết định có hiệu lực",
    },
    // Ký trước ngày hiệu lực: tác vụ decision-effects đổi tình trạng đúng ngày.
    { student: nextStudying(), kind: "reserve", status: "signed", daysAgo: -2, effectiveIn: 12, title: "Bảo lưu kết quả học tập học kỳ 2, năm học 2026-2027", basis: "Đơn xin bảo lưu vì lý do sức khỏe, có giấy xác nhận của bệnh viện" },
    ...STUDENTS.filter((student) => student.status === "reserved").map((student) => ({
      student,
      kind: "reserve" as const,
      status: "signed" as const,
      daysAgo: -120,
      title: "Bảo lưu kết quả học tập 2 học kỳ",
      basis: "Đơn xin bảo lưu của sinh viên, ý kiến của khoa",
      previousStatus: "studying" as const,
    })),
    ...STUDENTS.filter((student) => student.status === "suspended").map((student) => ({
      student,
      kind: "suspend" as const,
      status: "signed" as const,
      daysAgo: -40,
      title: "Tạm ngừng học do nợ học phí 2 học kỳ",
      basis: "Biên bản rà soát học phí của Phòng Kế hoạch - Tài chính",
      previousStatus: "studying" as const,
    })),
  ];

  return seeds.map((seed, position) => {
    const signed = seed.status === "signed" || seed.status === "revoked";
    const effectiveDate = day(seed.daysAgo + (seed.effectiveIn ?? 7));
    const applied = signed && seed.status === "signed" && effectiveDate <= day(0);
    return {
      id: mockId(`decision:${position + 1}`),
      number: signed || seed.status === "pending-signature" ? `${1180 + position * 7}/QĐ-ĐHSP` : null,
      kind: seed.kind,
      studentId: seed.student.id,
      title: seed.title,
      basis: seed.basis,
      effectiveDate,
      status: seed.status,
      disciplineLevel: seed.disciplineLevel ?? null,
      targetClassId: seed.kind === "major-change" ? classIdOf(seed.student.className) : null,
      previousStatus: applied ? (seed.previousStatus ?? seed.student.status) : null,
      previousClassId: applied ? classIdOf(seed.previousClassName ?? seed.student.className) : null,
      appliedAt: applied ? new Date(mockDate(seed.daysAgo + 7, "00:05")) : null,
      signedBy: signed ? signerLabel : null,
      signedByUserId: signed ? signerUserId : null,
      signedAt: signed ? new Date(mockDate(seed.daysAgo, "15:00")) : null,
      revokedAt: seed.revokeReason ? new Date(mockDate(seed.daysAgo + 3, "10:00")) : null,
      revokedByUserId: seed.revokeReason ? signerUserId : null,
      revokedBy: seed.revokeReason ? signerLabel : null,
      revokeReason: seed.revokeReason ?? null,
    };
  });
}
