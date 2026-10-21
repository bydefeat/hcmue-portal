import "server-only";
import { asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { formatStudentCode } from "@/shared/libs/student-code.lib";
import { requireRole } from "@/modules/authentication/authentication.query";
import { studentAdvisor, studentAppointments } from "@/modules/advising/advising.lib";
import { advisingAppointments, advisingNotes, appointmentStudents } from "@/modules/advising/advising.schema";
import type { Appointment, AppointmentStudent, MeetingNote } from "@/modules/advising/advising.type";
import { getCurrentStudent } from "@/modules/users/users.query";
import { administrativeClasses, lecturers, students } from "@/modules/users/users.schema";

async function appointmentRows(where: SQL): Promise<Appointment[]> {
  const rows = await db
    .select({
      id: advisingAppointments.id,
      advisorId: advisingAppointments.advisorId,
      topic: advisingAppointments.topic,
      date: advisingAppointments.date,
      startTime: advisingAppointments.startTime,
      durationMinutes: advisingAppointments.durationMinutes,
      mode: advisingAppointments.mode,
      location: advisingAppointments.location,
      status: advisingAppointments.status,
      note: advisingAppointments.note,
    })
    .from(advisingAppointments)
    .where(where)
    .orderBy(asc(advisingAppointments.date), asc(advisingAppointments.startTime));
  if (rows.length === 0) return [];
  const members = await db
    .select({
      appointmentId: appointmentStudents.appointmentId,
      id: students.id,
      code: students.code,
      fullName: students.fullName,
      className: administrativeClasses.code,
      attendance: appointmentStudents.attendance,
    })
    .from(appointmentStudents)
    .innerJoin(students, eq(students.id, appointmentStudents.studentId))
    .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .where(
      inArray(
        appointmentStudents.appointmentId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(students.code));
  const studentsOf = new Map<string, AppointmentStudent[]>();
  for (const { appointmentId, ...student } of members) {
    studentsOf.set(appointmentId, [...(studentsOf.get(appointmentId) ?? []), { ...student, code: formatStudentCode(student.code) }]);
  }
  return rows.map((row) => ({ ...row, startTime: row.startTime.slice(0, 5), students: studentsOf.get(row.id) ?? [] }));
}

export async function getAppointments(advisorId: string) {
  await requireRole("lecturer");
  if (!isUuid(advisorId)) return [];
  return appointmentRows(eq(advisingAppointments.advisorId, advisorId));
}

export async function getAppointment(id: string) {
  await requireRole("lecturer");
  if (!isUuid(id)) return null;
  const [appointment] = await appointmentRows(eq(advisingAppointments.id, id));
  return appointment ?? null;
}

async function noteRows(where: SQL): Promise<MeetingNote[]> {
  const rows = await db
    .select({
      id: advisingNotes.id,
      studentId: advisingNotes.studentId,
      appointmentId: advisingNotes.appointmentId,
      at: advisingNotes.at,
      authorTitle: lecturers.title,
      authorName: lecturers.fullName,
      topic: advisingNotes.topic,
      content: advisingNotes.content,
      followUp: advisingNotes.followUp,
    })
    .from(advisingNotes)
    .innerJoin(lecturers, eq(lecturers.id, advisingNotes.authorId))
    .where(where)
    .orderBy(desc(advisingNotes.at), asc(advisingNotes.id));
  return rows.map(({ authorTitle, authorName, at, ...row }) => ({ ...row, at: at.toISOString(), author: `${authorTitle} ${authorName}` }));
}

export async function getMeetingNotes(studentIds: string[]) {
  await requireRole("lecturer");
  const ids = studentIds.filter(isUuid);
  return ids.length > 0 ? noteRows(inArray(advisingNotes.studentId, ids)) : [];
}

export async function getMeetingNotesByIds(ids: string[]) {
  await requireRole("lecturer");
  const valid = ids.filter(isUuid);
  return valid.length > 0 ? noteRows(inArray(advisingNotes.id, valid)) : [];
}

export async function getMyAppointments() {
  const student = await getCurrentStudent();
  return studentAppointments(student.id);
}

export async function getMyAdvisor() {
  const student = await getCurrentStudent();
  return studentAdvisor(student.id);
}
