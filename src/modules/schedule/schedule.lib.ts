import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Transaction } from "@/shared/libs/db.lib";
import { periodLabel, weekdayLabel } from "@/shared/constants/period.constant";
import { classSections, enrollments, labGroups, sectionMeetings } from "@/modules/course-registration/course-registration.schema";
import { courses } from "@/modules/curriculum/curriculum.schema";
import { rooms } from "@/modules/facilities/facilities.schema";
import { notifyLecturers, notifyStudents } from "@/modules/notifications/notifications.lib";
import { diffClassSessions, planClassSessions } from "@/modules/schedule/schedule.rule";
import { attendanceRecords, classSessions } from "@/modules/schedule/schedule.schema";

export type WeeklySchedule = { signature: string; description: string };

function slotText(entry: { dayOfWeek: number; startPeriod: number; endPeriod: number; room: string }) {
  return `${weekdayLabel(entry.dayOfWeek)} ${periodLabel(entry.startPeriod, entry.endPeriod).toLowerCase()}, phòng ${entry.room}`;
}

// Lịch tuần hiện tại của lớp (lý thuyết, nhóm thực hành, phòng, khoảng ngày học) dạng chuỗi để so trước và sau khi sửa lớp.
export async function weeklyScheduleOf(tx: Transaction, sectionId: string): Promise<WeeklySchedule> {
  const [[section], meetings, labs] = await Promise.all([
    tx.select({ startDate: classSections.startDate, endDate: classSections.endDate }).from(classSections).where(eq(classSections.id, sectionId)),
    tx
      .select({ dayOfWeek: sectionMeetings.dayOfWeek, startPeriod: sectionMeetings.startPeriod, endPeriod: sectionMeetings.endPeriod, room: rooms.code })
      .from(sectionMeetings)
      .innerJoin(rooms, eq(rooms.id, sectionMeetings.roomId))
      .where(eq(sectionMeetings.classSectionId, sectionId))
      .orderBy(asc(sectionMeetings.dayOfWeek), asc(sectionMeetings.startPeriod)),
    tx
      .select({ code: labGroups.code, dayOfWeek: labGroups.dayOfWeek, startPeriod: labGroups.startPeriod, endPeriod: labGroups.endPeriod, room: rooms.code })
      .from(labGroups)
      .innerJoin(rooms, eq(rooms.id, labGroups.roomId))
      .where(eq(labGroups.classSectionId, sectionId))
      .orderBy(asc(labGroups.code)),
  ]);
  const parts = [...meetings.map(slotText), ...labs.map((lab) => `nhóm ${lab.code.split(".").at(-1)} ${slotText(lab)}`)];
  return {
    signature: JSON.stringify([section?.startDate, section?.endDate, meetings, labs]),
    description: parts.join("; "),
  };
}

// Sinh lại buổi học của một lớp theo lịch tuần hiện tại, trong cùng transaction với thao tác sửa lớp. Lớp không mở (nháp, đã hủy)
// thì không có buổi tương lai. Truyền lịch trước khi sửa (`previous`) thì báo sinh viên của lớp và giảng viên khi lịch tuần thật sự đổi.
export async function syncClassSessions(tx: Transaction, sectionId: string, options: { previous?: WeeklySchedule | null } = {}) {
  const [[section], [{ today }]] = await Promise.all([
    tx
      .select({ id: classSections.id, code: classSections.code, status: classSections.status, startDate: classSections.startDate, endDate: classSections.endDate, lecturerId: classSections.lecturerId, courseName: courses.name })
      .from(classSections)
      .innerJoin(courses, eq(courses.id, classSections.courseId))
      .where(eq(classSections.id, sectionId)),
    tx.execute<{ today: string }>(sql`SELECT to_char((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD') AS today`),
  ]);
  if (!section) return { added: 0, removed: 0, kept: 0, notified: false };
  const [meetings, labs, existing] = await Promise.all([
    tx
      .select({ dayOfWeek: sectionMeetings.dayOfWeek, startPeriod: sectionMeetings.startPeriod, endPeriod: sectionMeetings.endPeriod, roomId: sectionMeetings.roomId })
      .from(sectionMeetings)
      .where(eq(sectionMeetings.classSectionId, sectionId)),
    tx
      .select({ id: labGroups.id, dayOfWeek: labGroups.dayOfWeek, startPeriod: labGroups.startPeriod, endPeriod: labGroups.endPeriod, roomId: labGroups.roomId })
      .from(labGroups)
      .where(eq(labGroups.classSectionId, sectionId)),
    tx
      .select({
        id: classSessions.id,
        classSectionId: classSessions.classSectionId,
        labGroupId: classSessions.labGroupId,
        date: classSessions.date,
        startPeriod: classSessions.startPeriod,
        endPeriod: classSessions.endPeriod,
        roomId: classSessions.roomId,
        isTaken: sql<boolean>`${classSessions.takenAt} IS NOT NULL OR EXISTS (SELECT 1 FROM ${attendanceRecords} WHERE ${attendanceRecords.classSessionId} = ${classSessions.id})`,
      })
      .from(classSessions)
      .where(eq(classSessions.classSectionId, sectionId))
      .for("update", { of: classSessions }),
  ]);
  const plans = section.status === "open" ? planClassSessions({ id: section.id, startDate: section.startDate, endDate: section.endDate, meetings, labGroups: labs }) : [];
  const diff = diffClassSessions(existing, plans, today);
  if (diff.removeIds.length > 0) await tx.delete(classSessions).where(inArray(classSessions.id, diff.removeIds));
  if (diff.add.length > 0) await tx.insert(classSessions).values(diff.add);

  let notified = false;
  if (options.previous && section.status === "open") {
    const current = await weeklyScheduleOf(tx, sectionId);
    if (current.signature !== options.previous.signature) {
      const roster = await tx
        .select({ studentId: enrollments.studentId })
        .from(enrollments)
        .where(and(eq(enrollments.classSectionId, sectionId), eq(enrollments.status, "enrolled")));
      const body = `Lịch mới của lớp ${section.code} (${section.courseName}): ${current.description}. Áp dụng từ hôm nay, các buổi đã học và đã điểm danh giữ nguyên.`;
      await notifyStudents(
        tx,
        roster.map((row) => row.studentId),
        { kind: "system", title: `Lớp ${section.code} đổi lịch học`, body, href: "/application/schedule" },
      );
      if (section.lecturerId) {
        await notifyLecturers(tx, [section.lecturerId], { kind: "system", title: `Lớp ${section.code} đổi lịch dạy`, body, href: `/lecturer/classes/${section.id}/attendance` });
      }
      notified = true;
    }
  }
  return { added: diff.add.length, removed: diff.removeIds.length, kept: diff.kept, notified };
}
