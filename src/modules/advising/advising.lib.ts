import "server-only";
import { asc, count, eq, inArray } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { advisingAppointments, appointmentStudents } from "@/modules/advising/advising.schema";
import type { StudentAdvisor, StudentAppointment } from "@/modules/advising/advising.type";
import { administrativeClasses, lecturers, students } from "@/modules/users/users.schema";

// Hàm không kiểm phiên: query gọi sau khi đã xác định sinh viên đang đăng nhập (test gọi thẳng với id).

// Buổi hẹn sinh viên được mời. Không chọn cột note: đó là ghi chép của cố vấn, buổi hẹn nhóm có thể nhắc tới sinh viên khác.
export async function studentAppointments(studentId: string): Promise<StudentAppointment[]> {
  if (!isUuid(studentId)) return [];
  const rows = await db
    .select({
      id: advisingAppointments.id,
      topic: advisingAppointments.topic,
      date: advisingAppointments.date,
      startTime: advisingAppointments.startTime,
      durationMinutes: advisingAppointments.durationMinutes,
      mode: advisingAppointments.mode,
      location: advisingAppointments.location,
      status: advisingAppointments.status,
      advisorTitle: lecturers.title,
      advisorName: lecturers.fullName,
    })
    .from(appointmentStudents)
    .innerJoin(advisingAppointments, eq(advisingAppointments.id, appointmentStudents.appointmentId))
    .innerJoin(lecturers, eq(lecturers.id, advisingAppointments.advisorId))
    .where(eq(appointmentStudents.studentId, studentId))
    .orderBy(asc(advisingAppointments.date), asc(advisingAppointments.startTime));
  if (rows.length === 0) return [];
  const invitees = await db
    .select({ appointmentId: appointmentStudents.appointmentId, total: count() })
    .from(appointmentStudents)
    .where(
      inArray(
        appointmentStudents.appointmentId,
        rows.map((row) => row.id),
      ),
    )
    .groupBy(appointmentStudents.appointmentId);
  const countOf = new Map(invitees.map((row) => [row.appointmentId, row.total]));
  return rows.map(({ advisorTitle, advisorName, ...row }) => ({
    ...row,
    startTime: row.startTime.slice(0, 5),
    advisor: `${advisorTitle} ${advisorName}`,
    inviteeCount: countOf.get(row.id) ?? 1,
  }));
}

// Cố vấn của lớp sinh hoạt sinh viên đang thuộc; lớp chưa được phân công cố vấn thì null.
export async function studentAdvisor(studentId: string): Promise<StudentAdvisor | null> {
  if (!isUuid(studentId)) return null;
  const [row] = await db
    .select({
      className: administrativeClasses.code,
      title: lecturers.title,
      fullName: lecturers.fullName,
      email: lecturers.email,
      phone: lecturers.phone,
      office: lecturers.office,
      officeHours: lecturers.officeHours,
    })
    .from(students)
    .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .innerJoin(lecturers, eq(lecturers.id, administrativeClasses.advisorId))
    .where(eq(students.id, studentId));
  if (!row) return null;
  const { title, fullName, ...contact } = row;
  return { ...contact, displayName: `${title} ${fullName}` };
}
