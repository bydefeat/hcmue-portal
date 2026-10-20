import "server-only";
import { cache } from "react";
import { forbidden } from "next/navigation";
import { and, asc, count, desc, eq, ne, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/shared/libs/db.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { formatStudentCode, normalizeStudentCode } from "@/shared/libs/student-code.lib";
import { requireRole, requireSession } from "@/modules/authentication/authentication.query";
import { user as users } from "@/modules/authentication/authentication.schema";
import { parseRoles } from "@/shared/constants/role.constant";
import { roleAssignments, roles } from "@/modules/access/access.schema";
import { faculties, majors } from "@/modules/curriculum/curriculum.schema";
import { administrativeClasses, lecturers, staffMembers, studentDecisions, students } from "@/modules/users/users.schema";
import { readAccountStates } from "@/modules/users/users.account";
import { STUDENT_STATUS } from "@/modules/users/users.constant";
import type { AccountKind, AdvisorAssignment, Lecturer, StaffMember, Student, StudentDecision } from "@/modules/users/users.type";

// Sinh viên kèm lớp sinh hoạt, ngành, khoa. MSSV trả ra theo dạng hiển thị "50.01.104.013".
async function studentRows(where?: SQL): Promise<Student[]> {
  const rows = await db
    .select({
      id: students.id,
      code: students.code,
      fullName: students.fullName,
      gender: students.gender,
      dateOfBirth: students.dateOfBirth,
      email: students.email,
      phone: students.phone,
      faculty: faculties.name,
      majorCode: majors.code,
      majorName: majors.name,
      cohort: administrativeClasses.cohort,
      className: administrativeClasses.code,
      status: students.status,
      hometown: students.hometown,
      personalEmail: students.personalEmail,
    })
    .from(students)
    .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
    .innerJoin(faculties, eq(faculties.id, majors.facultyId))
    .where(where)
    .orderBy(asc(students.code));
  return rows.map((row) => ({ ...row, code: formatStudentCode(row.code) }));
}

export const getStudents = cache(async () => {
  await requireSession();
  return studentRows();
});

// Các khóa đang có lớp sinh hoạt, tăng dần (48, 49, ...). Dùng cho ô lọc và ô chọn khóa.
export const getCohorts = cache(async (): Promise<number[]> => {
  await requireSession();
  const rows = await db
    .selectDistinct({ cohort: administrativeClasses.cohort })
    .from(administrativeClasses)
    .orderBy(asc(administrativeClasses.cohort));
  return rows.map((row) => row.cohort);
});

export async function getStudent(id: string) {
  await requireSession();
  if (!isUuid(id)) return null;
  const [student] = await studentRows(eq(students.id, id));
  return student ?? null;
}

// Đường dẫn trang sinh viên dùng MSSV, nhận cả dạng có dấu chấm.
export async function getStudentByCode(code: string) {
  await requireSession();
  const [student] = await studentRows(eq(students.code, normalizeStudentCode(decodeURIComponent(code))));
  return student ?? null;
}

export const getCurrentStudent = cache(async () => {
  const { user } = await requireRole("student");
  const [student] = await studentRows(eq(students.userId, user.id));
  // Tài khoản có vai trò sinh viên nhưng chưa gắn hồ sơ sinh viên: chưa được dùng cổng sinh viên.
  if (!student) forbidden();
  return student;
});

const advisedClassCount = db
  .select({ advisorId: administrativeClasses.advisorId, total: count().as("total") })
  .from(administrativeClasses)
  .groupBy(administrativeClasses.advisorId)
  .as("advised_class_count");

async function lecturerRows(where?: SQL): Promise<Lecturer[]> {
  const rows = await db
    .select({
      id: lecturers.id,
      code: lecturers.code,
      fullName: lecturers.fullName,
      title: lecturers.title,
      gender: lecturers.gender,
      faculty: faculties.name,
      email: lecturers.email,
      phone: lecturers.phone,
      personalEmail: lecturers.personalEmail,
      office: lecturers.office,
      officeHours: lecturers.officeHours,
      status: lecturers.status,
      advisedClasses: advisedClassCount.total,
      accountRole: users.role,
    })
    .from(lecturers)
    .innerJoin(faculties, eq(faculties.id, lecturers.facultyId))
    .leftJoin(advisedClassCount, eq(advisedClassCount.advisorId, lecturers.id))
    .leftJoin(users, eq(users.id, lecturers.userId))
    .where(where)
    .orderBy(asc(lecturers.code));
  // Vai trò hiện trên bảng giảng viên: cố vấn suy ra từ lớp được phân công, quản trị từ vai trò của tài khoản.
  return rows.map(({ advisedClasses, accountRole, ...row }) => {
    const isAdvisor = (advisedClasses ?? 0) > 0;
    const isAdmin = parseRoles(accountRole).includes("admin");
    return { ...row, displayName: `${row.title} ${row.fullName}`, isAdvisor, roles: ["lecturer", ...(isAdvisor ? ["advisor"] : []), ...(isAdmin ? ["admin"] : [])] };
  });
}

export const getLecturers = cache(async () => {
  await requireSession();
  return lecturerRows();
});

export async function getLecturer(id: string) {
  await requireSession();
  if (!isUuid(id)) return null;
  const [lecturer] = await lecturerRows(eq(lecturers.id, id));
  return lecturer ?? null;
}

// Thông tin liên hệ thêm của sinh viên đang đăng nhập, chỉ hiện ở trang hồ sơ của chính sinh viên.
export async function getMyStudentContact() {
  const student = await getCurrentStudent();
  const [row] = await db
    .select({
      personalEmail: students.personalEmail,
      address: students.address,
      emergencyName: students.emergencyContactName,
      emergencyPhone: students.emergencyContactPhone,
    })
    .from(students)
    .where(eq(students.id, student.id));
  return row;
}

// Dùng cho action ghi của sinh viên: bảo lưu, tạm ngừng học, đã tốt nghiệp thì chỉ xem, không thao tác được.
export async function requireActiveStudent() {
  const student = await getCurrentStudent();
  if (student.status !== "studying") {
    const label = STUDENT_STATUS[student.status].label.toLowerCase();
    return { student: null, message: `Bạn đang ở tình trạng "${label}" nên chưa thực hiện được thao tác này. Liên hệ Phòng Đào tạo nếu cần hỗ trợ.` } as const;
  }
  return { student, message: null } as const;
}

// Trạng thái tài khoản đăng nhập theo id hồ sơ, cho bảng sinh viên, giảng viên, cán bộ của cổng quản trị.
export async function getAccountStates(kind: AccountKind) {
  await requireRole("admin");
  return readAccountStates(db, kind);
}

export const getCurrentLecturer = cache(async () => {
  const { user } = await requireRole("lecturer");
  const [lecturer] = await lecturerRows(eq(lecturers.userId, user.id));
  if (!lecturer) forbidden();
  return lecturer;
});

async function assignmentRows(where?: SQL): Promise<AdvisorAssignment[]> {
  const memberCount = db
    .select({ classId: students.administrativeClassId, total: count().as("total") })
    .from(students)
    .groupBy(students.administrativeClassId)
    .as("member_count");
  const rows = await db
    .select({
      className: administrativeClasses.code,
      faculty: faculties.name,
      majorName: majors.name,
      cohort: administrativeClasses.cohort,
      studentCount: memberCount.total,
      advisorId: lecturers.id,
      advisorTitle: lecturers.title,
      advisorName: lecturers.fullName,
    })
    .from(administrativeClasses)
    .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
    .innerJoin(faculties, eq(faculties.id, majors.facultyId))
    .leftJoin(lecturers, eq(lecturers.id, administrativeClasses.advisorId))
    .leftJoin(memberCount, eq(memberCount.classId, administrativeClasses.id))
    .where(where)
    .orderBy(asc(administrativeClasses.code));
  return rows.map(({ advisorTitle, advisorName, studentCount, ...row }) => ({
    ...row,
    studentCount: studentCount ?? 0,
    advisorName: advisorName ? `${advisorTitle} ${advisorName}` : null,
  }));
}

export async function getAdvisorAssignments() {
  await requireSession();
  return assignmentRows();
}

export async function getAdvisedClasses(lecturerId: string) {
  await requireSession();
  if (!isUuid(lecturerId)) return [];
  return assignmentRows(eq(administrativeClasses.advisorId, lecturerId));
}

export async function getAdvisees(lecturerId: string) {
  await requireSession();
  if (!isUuid(lecturerId)) return [];
  return studentRows(and(eq(administrativeClasses.advisorId, lecturerId), ne(students.status, "graduated")));
}

export async function getAdvisorOf(studentId: string) {
  await requireSession();
  if (!isUuid(studentId)) return null;
  const [row] = await db
    .select({ advisorId: administrativeClasses.advisorId })
    .from(students)
    .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .where(eq(students.id, studentId));
  if (!row?.advisorId) return null;
  const [lecturer] = await lecturerRows(eq(lecturers.id, row.advisorId));
  return lecturer ?? null;
}

export async function getDecisions(studentId?: string): Promise<StudentDecision[]> {
  await requireSession();
  if (studentId !== undefined && !isUuid(studentId)) return [];
  return decisionRows(studentId ? eq(studentDecisions.studentId, studentId) : undefined);
}

export async function getDecision(id: string): Promise<StudentDecision | null> {
  await requireSession();
  if (!isUuid(id)) return null;
  const [row] = await decisionRows(eq(studentDecisions.id, id));
  return row ?? null;
}

const targetClass = alias(administrativeClasses, "target_class");
const targetMajor = alias(majors, "target_major");

async function decisionRows(where?: SQL): Promise<StudentDecision[]> {
  const rows = await db
    .select({
      id: studentDecisions.id,
      number: studentDecisions.number,
      kind: studentDecisions.kind,
      studentId: students.id,
      studentCode: students.code,
      studentName: students.fullName,
      className: administrativeClasses.code,
      faculty: faculties.name,
      title: studentDecisions.title,
      effectiveDate: studentDecisions.effectiveDate,
      signedBy: studentDecisions.signedBy,
      signedAt: studentDecisions.signedAt,
      status: studentDecisions.status,
      basis: studentDecisions.basis,
      disciplineLevel: studentDecisions.disciplineLevel,
      targetClassName: targetClass.code,
      targetMajorName: targetMajor.name,
      appliedAt: studentDecisions.appliedAt,
      createdByUserId: studentDecisions.createdByUserId,
      returnReason: studentDecisions.returnReason,
      revokedAt: studentDecisions.revokedAt,
      revokedBy: studentDecisions.revokedBy,
      revokeReason: studentDecisions.revokeReason,
    })
    .from(studentDecisions)
    .innerJoin(students, eq(students.id, studentDecisions.studentId))
    .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
    .innerJoin(faculties, eq(faculties.id, majors.facultyId))
    .leftJoin(targetClass, eq(targetClass.id, studentDecisions.targetClassId))
    .leftJoin(targetMajor, eq(targetMajor.id, targetClass.majorId))
    .where(where)
    .orderBy(desc(studentDecisions.effectiveDate), asc(studentDecisions.id));
  return rows.map((row) => ({
    ...row,
    studentCode: formatStudentCode(row.studentCode),
    signedAt: row.signedAt?.toISOString() ?? null,
    appliedAt: row.appliedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  }));
}

async function staffRows(where?: SQL): Promise<StaffMember[]> {
  const [rows, held] = await Promise.all([
    db.select().from(staffMembers).where(where).orderBy(asc(staffMembers.code)),
    db.select({ userId: roleAssignments.userId, name: roles.name }).from(roleAssignments).innerJoin(roles, eq(roles.id, roleAssignments.roleId)).orderBy(asc(roles.name)),
  ]);
  const rolesOf = new Map<string, string[]>();
  for (const entry of held) rolesOf.set(entry.userId, [...(rolesOf.get(entry.userId) ?? []), entry.name]);
  return rows.map((row) => ({ id: row.id, code: row.code, fullName: row.fullName, unit: row.unit, email: row.email, userId: row.userId, roles: row.userId ? (rolesOf.get(row.userId) ?? []) : [] }));
}

// Cán bộ (không phải giảng viên) có hồ sơ ở staff_members: trang Cán bộ của cổng quản trị.
export async function getStaffMembers() {
  await requireRole("admin");
  return staffRows();
}

export async function getStaffMember(id: string) {
  await requireRole("admin");
  if (!isUuid(id)) return null;
  const [row] = await staffRows(eq(staffMembers.id, id));
  return row ?? null;
}
