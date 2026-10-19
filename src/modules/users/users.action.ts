"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { studentEmailOf } from "@/shared/libs/student-code.lib";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";
import { faculties, majors } from "@/modules/curriculum/curriculum.schema";
import { USERS_CONSTRAINT_MESSAGE } from "@/modules/users/users.constant";
import { getCurrentLecturer, getCurrentStudent, getDecisions, getLecturer, getStudent } from "@/modules/users/users.query";
import {
  DECISION_SCHEMA,
  LECTURER_CONTACT_SCHEMA,
  LECTURER_SCHEMA,
  STUDENT_CONTACT_SCHEMA,
  STUDENT_SCHEMA,
  type DecisionInput,
  type LecturerContactInput,
  type LecturerInput,
  type StudentContactInput,
  type StudentInput,
} from "@/modules/users/users.rule";
import { administrativeClasses, lecturers, studentDecisions, students } from "@/modules/users/users.schema";
import type { DecisionKind, Lecturer, Student, StudentDecision, StudentStatus } from "@/modules/users/users.type";

class InputError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

function failure(error: unknown) {
  if (error instanceof InputError) return actionError(error.message, { [error.field]: error.message });
  return actionFailure(error, USERS_CONSTRAINT_MESSAGE);
}

// Lớp sinh hoạt theo mã; chưa có thì tạo mới cho ngành và khóa của sinh viên, có rồi thì phải đúng ngành và khóa.
async function classIdFor(tx: Transaction, className: string, majorCode: string, cohort: number) {
  const [major] = await tx
    .select({ id: majors.id, faculty: faculties.name })
    .from(majors)
    .innerJoin(faculties, eq(faculties.id, majors.facultyId))
    .where(eq(majors.code, majorCode));
  if (!major) throw new InputError("majorCode", "Ngành không có trong danh mục");
  const [existing] = await tx.select().from(administrativeClasses).where(eq(administrativeClasses.code, className));
  if (existing) {
    if (existing.majorId !== major.id || existing.cohort !== cohort) throw new InputError("className", `Lớp ${className} thuộc ngành hoặc khóa khác`);
    return { classId: existing.id, faculty: major.faculty };
  }
  const [created] = await tx.insert(administrativeClasses).values({ code: className, majorId: major.id, cohort }).returning({ id: administrativeClasses.id });
  return { classId: created.id, faculty: major.faculty };
}

function studentColumns(values: z.output<typeof STUDENT_SCHEMA>, classId: string) {
  return {
    fullName: values.fullName,
    gender: values.gender,
    dateOfBirth: values.dateOfBirth,
    email: values.email || studentEmailOf(values.code),
    phone: values.phone,
    administrativeClassId: classId,
    status: values.status,
  };
}

export async function saveStudent(id: string | null, input: StudentInput): Promise<ActionResult<Student>> {
  const viewer = await requirePermission("students.manage");
  if (id !== null && !isUuid(id)) return actionError("Sinh viên không còn tồn tại, tải lại trang.");
  const parsed = parseInput(STUDENT_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const values = parsed.data;
  let studentId: string;
  try {
    studentId = await db.transaction(async (tx) => {
      const { classId, faculty } = await classIdFor(tx, values.className, values.majorCode, values.cohort);
      if (!inScope(viewer, faculty)) throw new InputError("majorCode", "Ngành thuộc khoa khác, bạn không quản lý hồ sơ này");
      // MSSV không đổi sau khi tạo vì đã gắn với điểm, đăng ký và tài khoản đăng nhập.
      const [row] = id
        ? await tx.update(students).set(studentColumns(values, classId)).where(eq(students.id, id)).returning({ id: students.id })
        : await tx
            .insert(students)
            .values({ ...studentColumns(values, classId), code: values.code })
            .returning({ id: students.id });
      if (!row) throw new InputError("code", "Sinh viên không còn tồn tại, tải lại trang.");
      return row.id;
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/administrator/users/students", "layout");
  const student = await getStudent(studentId);
  return student ? actionOk(student) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

// Nhập nhiều sinh viên một lần: một dòng lỗi thì không dòng nào được ghi, để file nhập lại không bị trùng nửa chừng.
export async function importStudents(inputs: StudentInput[]): Promise<ActionResult<Student[]>> {
  const viewer = await requirePermission("students.manage");
  if (inputs.length === 0 || inputs.length > 2000) return actionError("Mỗi lần nhập từ 1 đến 2000 sinh viên.");
  const rows: z.output<typeof STUDENT_SCHEMA>[] = [];
  for (const [index, input] of inputs.entries()) {
    const parsed = STUDENT_SCHEMA.safeParse(input);
    if (!parsed.success) return actionError(`Dòng ${index + 1}: ${parsed.error.issues[0].message}`);
    rows.push(parsed.data);
  }
  let ids: string[];
  try {
    ids = await db.transaction(async (tx) => {
      const created: string[] = [];
      for (const [index, values] of rows.entries()) {
        const { classId, faculty } = await classIdFor(tx, values.className, values.majorCode, values.cohort).catch((error: unknown) => {
          throw error instanceof InputError ? new InputError(error.field, `Dòng ${index + 1}: ${error.message}`) : error;
        });
        if (!inScope(viewer, faculty)) throw new InputError("file", `Dòng ${index + 1}: ngành thuộc khoa khác`);
        const [row] = await tx
          .insert(students)
          .values({ ...studentColumns(values, classId), code: values.code })
          .returning({ id: students.id });
        created.push(row.id);
      }
      return created;
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/administrator/users/students", "layout");
  const all = await Promise.all(ids.map((id) => getStudent(id)));
  return actionOk(all.filter((student) => student !== null));
}

export async function setStudentsStatus(ids: string[], status: StudentStatus): Promise<ActionResult<{ updated: number }>> {
  const viewer = await requirePermission("students.manage");
  const parsed = z.object({ ids: z.array(z.uuid()).min(1).max(1000), status: z.enum(["studying", "reserved", "suspended", "graduated"]) }).safeParse({ ids, status });
  if (!parsed.success) return actionError("Chọn sinh viên và trạng thái hợp lệ.");
  try {
    const rows = await db
      .select({ id: students.id, faculty: faculties.name })
      .from(students)
      .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
      .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
      .innerJoin(faculties, eq(faculties.id, majors.facultyId))
      .where(inArray(students.id, parsed.data.ids));
    if (rows.some((row) => !inScope(viewer, row.faculty))) return actionError("Có sinh viên thuộc khoa khác, bạn không đổi trạng thái được.");
    const updated = await db.update(students).set({ status: parsed.data.status }).where(inArray(students.id, parsed.data.ids)).returning({ id: students.id });
    revalidatePath("/administrator/users/students", "layout");
    return actionOk({ updated: updated.length });
  } catch (error) {
    return failure(error);
  }
}

export async function saveLecturer(id: string | null, input: LecturerInput): Promise<ActionResult<Lecturer>> {
  await requirePermission("lecturers.manage");
  if (id !== null && !isUuid(id)) return actionError("Giảng viên không còn tồn tại, tải lại trang.");
  const parsed = parseInput(LECTURER_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { faculty, code, ...values } = parsed.data;
  let lecturerId: string;
  try {
    const [facultyRow] = await db.select({ id: faculties.id }).from(faculties).where(eq(faculties.name, faculty));
    if (!facultyRow) return actionError("Khoa không có trong danh mục", { faculty: "Khoa không có trong danh mục" });
    const [row] = id
      ? await db
          .update(lecturers)
          .set({ ...values, facultyId: facultyRow.id })
          .where(eq(lecturers.id, id))
          .returning({ id: lecturers.id })
      : await db
          .insert(lecturers)
          .values({ ...values, code, facultyId: facultyRow.id })
          .returning({ id: lecturers.id });
    if (!row) return actionError("Giảng viên không còn tồn tại, tải lại trang.");
    lecturerId = row.id;
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/administrator/users/lecturers");
  const lecturer = await getLecturer(lecturerId);
  return lecturer ? actionOk(lecturer) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

export async function assignAdvisor(className: string, lecturerId: string | null): Promise<ActionResult> {
  const viewer = await requirePermission("advisors.assign");
  if (lecturerId !== null && !isUuid(lecturerId)) return actionError("Giảng viên không còn tồn tại, tải lại trang.");
  const [row] = await db
    .select({ id: administrativeClasses.id, faculty: faculties.name })
    .from(administrativeClasses)
    .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
    .innerJoin(faculties, eq(faculties.id, majors.facultyId))
    .where(eq(administrativeClasses.code, className));
  if (!row) return actionError("Lớp sinh hoạt không còn tồn tại, tải lại trang.");
  if (!inScope(viewer, row.faculty)) return actionError("Lớp thuộc khoa khác, bạn không phân công được.");
  try {
    await db.update(administrativeClasses).set({ advisorId: lecturerId }).where(eq(administrativeClasses.id, row.id));
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/administrator/users/advisors");
  revalidatePath("/lecturer", "layout");
  return actionOk();
}

export async function saveMyStudentContact(input: StudentContactInput): Promise<ActionResult> {
  const student = await getCurrentStudent();
  const parsed = parseInput(STUDENT_CONTACT_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { emergencyName, emergencyPhone, ...values } = parsed.data;
  try {
    await db
      .update(students)
      .set({ ...values, emergencyContactName: emergencyName, emergencyContactPhone: emergencyPhone })
      .where(eq(students.id, student.id));
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/application/profile");
  return actionOk();
}

export async function saveMyLecturerContact(input: LecturerContactInput): Promise<ActionResult> {
  const lecturer = await getCurrentLecturer();
  const parsed = parseInput(LECTURER_CONTACT_SCHEMA, input);
  if (!parsed.ok) return parsed;
  try {
    await db.update(lecturers).set(parsed.data).where(eq(lecturers.id, lecturer.id));
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/lecturer/profile");
  return actionOk();
}

// Trạng thái học tập sinh viên nhận khi quyết định được ký; thu hồi thì trở lại đang học.
const STATUS_AFTER_SIGN: Partial<Record<DecisionKind, StudentStatus>> = {
  reserve: "reserved",
  resume: "studying",
  suspend: "suspended",
  graduate: "graduated",
};

async function decisionOf(id: string) {
  return (await getDecisions()).find((decision) => decision.id === id) ?? null;
}

export async function createDecision(input: DecisionInput): Promise<ActionResult<StudentDecision>> {
  const viewer = await requirePermission("decisions.manage");
  const parsed = parseInput(DECISION_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const student = await getStudent(parsed.data.studentId);
  if (!student || !inScope(viewer, student.faculty)) return actionError("Sinh viên không còn tồn tại hoặc thuộc khoa khác.", { studentId: "Sinh viên không hợp lệ" });
  let id: string;
  try {
    const [row] = await db.insert(studentDecisions).values(parsed.data).returning({ id: studentDecisions.id });
    id = row.id;
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/administrator/decisions");
  const decision = await decisionOf(id);
  return decision ? actionOk(decision) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

type DecisionStep = "submit" | "sign" | "revoke";

const FROM_STATUS: Record<DecisionStep, StudentDecision["status"]> = { submit: "draft", sign: "pending-signature", revoke: "signed" };

// Dự thảo → trình ký (cấp số) → ký (đổi trạng thái sinh viên) → thu hồi. Khóa dòng để hai người bấm cùng lúc không làm lệch số.
export async function advanceDecision(id: string, step: DecisionStep): Promise<ActionResult<StudentDecision>> {
  const viewer = await requirePermission("decisions.manage");
  if (!isUuid(id) || !(step in FROM_STATUS)) return actionError("Quyết định không còn tồn tại, tải lại trang.");
  try {
    const outcome = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(studentDecisions).where(eq(studentDecisions.id, id)).for("update");
      if (!row) return "Quyết định không còn tồn tại, tải lại trang.";
      if (row.status !== FROM_STATUS[step]) return "Quyết định đã được người khác xử lý, tải lại trang.";
      const student = await getStudent(row.studentId);
      if (!student || !inScope(viewer, student.faculty)) return "Sinh viên thuộc khoa khác.";
      if (step === "submit") {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('student_decisions_number'))`);
        const [{ next }] = await tx
          .select({ next: sql<number>`coalesce(max(split_part(${studentDecisions.number}, '/', 1)::int), 1300) + 1` })
          .from(studentDecisions)
          .where(sql`${studentDecisions.number} ~ '^[0-9]+/'`);
        await tx.update(studentDecisions).set({ status: "pending-signature", number: `${next}/QĐ-ĐHSP` }).where(eq(studentDecisions.id, id));
      } else if (step === "sign") {
        await tx.update(studentDecisions).set({ status: "signed", signedBy: `${viewer.name}, ${viewer.roleName}`, signedAt: new Date() }).where(eq(studentDecisions.id, id));
        const status = STATUS_AFTER_SIGN[row.kind];
        if (status) await tx.update(students).set({ status }).where(eq(students.id, row.studentId));
      } else {
        await tx.update(studentDecisions).set({ status: "revoked" }).where(eq(studentDecisions.id, id));
        if (STATUS_AFTER_SIGN[row.kind]) {
          await tx.update(students).set({ status: "studying" }).where(and(eq(students.id, row.studentId), eq(students.status, STATUS_AFTER_SIGN[row.kind]!)));
        }
      }
      return null;
    });
    if (outcome) return actionError(outcome);
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/administrator", "layout");
  const decision = await decisionOf(id);
  return decision ? actionOk(decision) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}
