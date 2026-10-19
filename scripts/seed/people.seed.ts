import type { Transaction } from "@/shared/libs/db.lib";
import { mockId } from "@/shared/libs/mock.lib";
import { formatStudentCode, normalizeStudentCode } from "@/shared/libs/student-code.lib";
import { ROLES } from "@/modules/access/access.mock";
import { roleAssignments, rolePermissions, roles } from "@/modules/access/access.schema";
import { account, user } from "@/modules/authentication/authentication.schema";
import { ADVISOR_ASSIGNMENTS, CURRENT_LECTURER_ID, CURRENT_STUDENT_ID, DECISIONS, LECTURERS, STUDENTS } from "@/modules/users/users.mock";
import { administrativeClasses, lecturerLoadNorms, lecturers, staffMembers, studentDecisions, students } from "@/modules/users/users.schema";
import { by, type SeedContext } from "./context";

export const ADMIN = { code: "CB0021", name: "Trần Minh Khoa", unit: "Phòng Đào tạo", email: "khoatm@hcmue.edu.vn" };

export const classIdOf = (className: string) => mockId(`class:${className}`);

// Tài khoản đăng nhập, giảng viên, cán bộ, lớp sinh hoạt, sinh viên, quyết định, vai trò quản trị.
export async function seedPeople(tx: Transaction, context: SeedContext) {
  const currentStudent = STUDENTS.find((student) => student.id === CURRENT_STUDENT_ID)!;
  const currentLecturer = LECTURERS.find((lecturer) => lecturer.id === CURRENT_LECTURER_ID)!;
  const studentCode = normalizeStudentCode(currentStudent.code);

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
      },
      { name: currentLecturer.displayName, email: currentLecturer.email, emailVerified: true, role: "lecturer" },
      { name: ADMIN.name, email: ADMIN.email, emailVerified: true, role: "admin" },
    ])
    .returning();
  const [studentUser, lecturerUser, adminUser] = userRows;
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
      status: lecturer.status,
    })),
  );
  await tx.insert(lecturerLoadNorms).values([
    { title: "ThS.", normHours: 135 },
    { title: "TS.", normHours: 135 },
    { title: "PGS.TS.", normHours: 120 },
    { title: "GS.TS.", normHours: 120 },
  ]);
  await tx.insert(staffMembers).values({ userId: adminUser.id, code: ADMIN.code, fullName: ADMIN.name, unit: ADMIN.unit, email: ADMIN.email });

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

  await tx.insert(studentDecisions).values(
    DECISIONS.map((decision) => ({
      id: decision.id,
      number: decision.number,
      kind: decision.kind,
      studentId: decision.studentId,
      title: decision.title,
      basis: decision.basis,
      effectiveDate: decision.effectiveDate.slice(0, 10),
      status: decision.status,
      signedBy: decision.signedBy,
      signedAt: decision.signedAt ? new Date(decision.signedAt) : null,
    })),
  );

  const roleRows = await tx
    .insert(roles)
    .values(ROLES.map(({ id, name, description, scope, isSystem }) => ({ key: id, name, description, scope, isSystem })))
    .returning();
  const roleByKey = by(roleRows, (row) => row.key);
  await tx.insert(rolePermissions).values(ROLES.flatMap((role) => role.permissions.map((permission) => ({ roleId: roleByKey.get(role.id)!.id, permission }))));
  // Tài khoản admin seed có 2 vai trò để thử đổi vai trò: Trưởng phòng Đào tạo (mặc định) và Quản trị hệ thống (có quyền Phân quyền).
  await tx.insert(roleAssignments).values({ userId: adminUser.id, roleId: roleByKey.get("academic-head")!.id, grantedByUserId: adminUser.id });
  await tx.insert(roleAssignments).values({ userId: adminUser.id, roleId: roleByKey.get("system-admin")!.id, grantedByUserId: adminUser.id });

  return {
    students: STUDENTS.length,
    lecturers: LECTURERS.length,
    accounts: [
      `Sinh viên ${formatStudentCode(studentCode)} (${currentStudent.fullName})`,
      `Giảng viên ${currentLecturer.email} (${currentLecturer.displayName})`,
      `Phòng Đào tạo ${ADMIN.email} (${ADMIN.name})`,
    ],
  };
}
