"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/shared/libs/db.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { classSections, enrollments } from "@/modules/course-registration/course-registration.schema";
import { SCHEDULE_CONSTRAINT_MESSAGE } from "@/modules/schedule/schedule.constant";
import { ATTENDANCE_SAVE_SCHEMA, type AttendanceSaveInput } from "@/modules/schedule/schedule.rule";
import { attendanceRecords, classSessions } from "@/modules/schedule/schedule.schema";
import type { SavedAttendance } from "@/modules/schedule/schedule.type";
import { getCurrentLecturer } from "@/modules/users/users.query";

class InputError extends Error {}

// Giảng viên lưu điểm danh một buổi của lớp mình dạy. Buổi chưa tới ngày học không điểm danh được; danh sách phải đủ đúng
// các sinh viên đang học lớp (buổi thực hành: sinh viên của nhóm đó). DB chặn thêm bằng trigger attendance_records_same_section.
export async function saveAttendance(input: AttendanceSaveInput): Promise<ActionResult<SavedAttendance>> {
  const lecturer = await getCurrentLecturer();
  const parsed = parseInput(ATTENDANCE_SAVE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { classSessionId, records } = parsed.data;
  let sectionId: string;
  try {
    sectionId = await db.transaction(async (tx) => {
      const [session] = await tx
        .select({
          sectionId: classSessions.classSectionId,
          labGroupId: classSessions.labGroupId,
          isFuture: sql<boolean>`${classSessions.date} > (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`,
          lecturerId: classSections.lecturerId,
          sectionStatus: classSections.status,
        })
        .from(classSessions)
        .innerJoin(classSections, eq(classSections.id, classSessions.classSectionId))
        .where(eq(classSessions.id, classSessionId))
        .for("update", { of: classSessions });
      if (!session || session.lecturerId !== lecturer.id) throw new InputError("Buổi học không thuộc lớp bạn dạy, tải lại trang.");
      if (session.sectionStatus === "cancelled") throw new InputError("Lớp đã hủy, không điểm danh được.");
      if (session.isFuture) throw new InputError("Buổi học chưa diễn ra. Chỉ điểm danh được từ ngày học trở về trước.");

      const roster = await tx
        .select({ id: enrollments.id, studentId: enrollments.studentId, labGroupId: enrollments.labGroupId })
        .from(enrollments)
        .where(and(eq(enrollments.classSectionId, session.sectionId), eq(enrollments.status, "enrolled")));
      const expected = roster.filter((entry) => session.labGroupId === null || entry.labGroupId === session.labGroupId);
      const enrollmentOf = new Map(expected.map((entry) => [entry.studentId, entry.id]));
      if (records.some((record) => !enrollmentOf.has(record.studentId))) throw new InputError("Có sinh viên không thuộc danh sách của buổi học, tải lại trang.");
      if (records.length < expected.length) throw new InputError(`Còn ${expected.length - records.length} sinh viên chưa điểm danh.`);

      await tx
        .insert(attendanceRecords)
        .values(records.map((record) => ({ classSessionId, enrollmentId: enrollmentOf.get(record.studentId)!, status: record.status })))
        .onConflictDoUpdate({
          target: [attendanceRecords.classSessionId, attendanceRecords.enrollmentId],
          set: { status: sql`excluded.status`, updatedAt: sql`now()` },
        });
      await tx
        .update(classSessions)
        .set({ takenAt: sql`coalesce(${classSessions.takenAt}, now())` })
        .where(eq(classSessions.id, classSessionId));
      return session.sectionId;
    });
  } catch (error) {
    if (error instanceof InputError) return actionError(error.message);
    return actionFailure(error, SCHEDULE_CONSTRAINT_MESSAGE);
  }
  revalidatePath(`/lecturer/classes/${sectionId}/attendance`);
  revalidatePath("/application/exams");
  revalidatePath("/administrator/exams/eligibility");
  return actionOk({ sessionId: classSessionId, records: Object.fromEntries(records.map((record) => [record.studentId, record.status])) });
}
