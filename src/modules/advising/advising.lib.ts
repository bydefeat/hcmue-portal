import "server-only";
import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import type { z } from "zod";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { dayjs, formatDate } from "@/shared/libs/date.lib";
import { APPOINTMENT_MODE_LABEL } from "@/modules/advising/advising.constant";
import {
  appointmentsOverlap,
  appointmentStart,
  outcomeStatus,
  type ADVISING_NOTE_SCHEMA,
  type APPOINTMENT_OUTCOME_SCHEMA,
  type APPOINTMENT_RESCHEDULE_SCHEMA,
  type APPOINTMENT_SCHEMA,
} from "@/modules/advising/advising.rule";
import { notifyStudents } from "@/modules/notifications/notifications.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { advisingAppointments, advisingNotes, appointmentStudents } from "@/modules/advising/advising.schema";
import type { StudentAdvisor, StudentAppointment } from "@/modules/advising/advising.type";
import { administrativeClasses, lecturers, students } from "@/modules/users/users.schema";


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
      attendance: appointmentStudents.attendance,
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
  return rows.map(({ advisorTitle, advisorName, attendance, ...row }) => ({
    ...row,
    status: row.status === "done" && attendance === "absent" ? "missed" : row.status,
    startTime: row.startTime.slice(0, 5),
    advisor: `${advisorTitle} ${advisorName}`,
    inviteeCount: countOf.get(row.id) ?? 1,
  }));
}

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


export class AdvisingError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

const STUDENT_APPOINTMENT_HREF = "/application/advising";

const whenOf = (date: string, startTime: string) => `${startTime.slice(0, 5)} ngày ${formatDate(date)}`;

export async function adviseesAmong(tx: Transaction, lecturerId: string, studentIds: string[]) {
  if (studentIds.length === 0) return new Set<string>();
  const rows = await tx
    .select({ id: students.id })
    .from(students)
    .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .where(and(eq(administrativeClasses.advisorId, lecturerId), ne(students.status, "graduated"), inArray(students.id, studentIds)));
  return new Set(rows.map((row) => row.id));
}

async function assertAdvisorFree(tx: Transaction, advisorId: string, slot: { date: string; startTime: string; durationMinutes: number }, exceptId?: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`advising:${advisorId}`}, 0))`);
  const sameDay = await tx
    .select({ id: advisingAppointments.id, topic: advisingAppointments.topic, startTime: advisingAppointments.startTime, durationMinutes: advisingAppointments.durationMinutes })
    .from(advisingAppointments)
    .where(and(eq(advisingAppointments.advisorId, advisorId), eq(advisingAppointments.date, slot.date), eq(advisingAppointments.status, "scheduled")));
  const clash = sameDay.find((row) => row.id !== exceptId && appointmentsOverlap({ ...row, date: slot.date, startTime: row.startTime.slice(0, 5) }, slot));
  if (clash) throw new AdvisingError(`Trùng buổi hẹn "${clash.topic}" lúc ${clash.startTime.slice(0, 5)} cùng ngày. Chọn giờ khác.`, "startTime");
}

export async function createAppointmentFor(tx: Transaction, advisor: { id: string; displayName: string }, input: z.output<typeof APPOINTMENT_SCHEMA>) {
  const { studentIds, ...values } = input;
  if (!appointmentStart(values).isAfter(dayjs())) throw new AdvisingError("Giờ hẹn đã qua, chọn giờ khác.", "startTime");
  const advisees = await adviseesAmong(tx, advisor.id, studentIds);
  if (studentIds.some((id) => !advisees.has(id))) throw new AdvisingError("Chỉ hẹn được sinh viên thuộc lớp bạn cố vấn. Tải lại trang để cập nhật danh sách.", "studentIds");
  await assertAdvisorFree(tx, advisor.id, values);
  const [row] = await tx
    .insert(advisingAppointments)
    .values({ ...values, advisorId: advisor.id })
    .returning({ id: advisingAppointments.id });
  await tx.insert(appointmentStudents).values(studentIds.map((studentId) => ({ appointmentId: row.id, studentId })));
  await notifyStudents(tx, studentIds, {
    kind: "advising",
    title: `Cố vấn hẹn gặp: ${values.topic}`,
    body: `${advisor.displayName} hẹn bạn lúc ${whenOf(values.date, values.startTime)}, ${values.durationMinutes} phút, ${APPOINTMENT_MODE_LABEL[values.mode].toLowerCase()} tại ${values.location}.`,
    href: STUDENT_APPOINTMENT_HREF,
  });
  return row.id;
}

async function ownScheduled(tx: Transaction, advisorId: string, id: string) {
  const [row] = await tx
    .select({ id: advisingAppointments.id, topic: advisingAppointments.topic, date: advisingAppointments.date, startTime: advisingAppointments.startTime, durationMinutes: advisingAppointments.durationMinutes })
    .from(advisingAppointments)
    .where(and(eq(advisingAppointments.id, id), eq(advisingAppointments.advisorId, advisorId), eq(advisingAppointments.status, "scheduled")))
    .for("update");
  if (!row) throw new AdvisingError("Buổi hẹn không còn ở trạng thái đã hẹn hoặc không phải của bạn. Tải lại trang.");
  return { ...row, startTime: row.startTime.slice(0, 5) };
}

export async function recordAppointmentOutcome(tx: Transaction, advisorId: string, input: z.output<typeof APPOINTMENT_OUTCOME_SCHEMA>) {
  const appointment = await ownScheduled(tx, advisorId, input.id);
  if (appointmentStart(appointment).isAfter(dayjs())) throw new AdvisingError("Buổi hẹn chưa diễn ra, chưa ghi nhận được. Muốn đổi giờ thì dời lịch.");
  const members = await tx.select({ studentId: appointmentStudents.studentId }).from(appointmentStudents).where(eq(appointmentStudents.appointmentId, input.id));
  const ids = members.map((member) => member.studentId);
  if (ids.some((id) => !input.attendance[id]) || Object.keys(input.attendance).some((id) => !ids.includes(id))) {
    throw new AdvisingError("Ghi có mặt hay vắng cho đủ từng sinh viên được mời.", "attendance");
  }
  const status = outcomeStatus(input.attendance);
  for (const attendance of ["present", "absent"] as const) {
    const who = ids.filter((id) => input.attendance[id] === attendance);
    if (who.length > 0) await tx.update(appointmentStudents).set({ attendance }).where(and(eq(appointmentStudents.appointmentId, input.id), inArray(appointmentStudents.studentId, who)));
  }
  await tx
    .update(advisingAppointments)
    .set({ status, note: status === "done" ? input.note : (input.note ?? "Sinh viên không đến.") })
    .where(eq(advisingAppointments.id, input.id));
  const present = await adviseesAmong(
    tx,
    advisorId,
    ids.filter((id) => input.attendance[id] === "present"),
  );
  if (present.size === 0 || !input.note) return { status, noteIds: [] as string[] };
  const rows = await tx
    .insert(advisingNotes)
    .values([...present].map((studentId) => ({ studentId, authorId: advisorId, appointmentId: input.id, topic: appointment.topic, content: input.note!, followUp: input.followUp })))
    .returning({ id: advisingNotes.id });
  return { status, noteIds: rows.map((row) => row.id) };
}

export async function rescheduleAppointment(tx: Transaction, advisor: { id: string; displayName: string }, input: z.output<typeof APPOINTMENT_RESCHEDULE_SCHEMA>) {
  const appointment = await ownScheduled(tx, advisor.id, input.id);
  if (!appointmentStart(input).isAfter(dayjs())) throw new AdvisingError("Giờ hẹn mới đã qua, chọn giờ khác.", "startTime");
  await assertAdvisorFree(tx, advisor.id, input, input.id);
  await tx
    .update(advisingAppointments)
    .set({ date: input.date, startTime: input.startTime, durationMinutes: input.durationMinutes, location: input.location })
    .where(eq(advisingAppointments.id, input.id));
  const members = await tx.select({ studentId: appointmentStudents.studentId }).from(appointmentStudents).where(eq(appointmentStudents.appointmentId, input.id));
  await notifyStudents(
    tx,
    members.map((member) => member.studentId),
    {
      kind: "advising",
      title: `Cố vấn dời buổi hẹn: ${appointment.topic}`,
      body: `${advisor.displayName} dời buổi hẹn từ ${whenOf(appointment.date, appointment.startTime)} sang ${whenOf(input.date, input.startTime)}, ${input.durationMinutes} phút, tại ${input.location}.`,
      href: STUDENT_APPOINTMENT_HREF,
    },
  );
}

export async function cancelAppointmentFor(tx: Transaction, advisor: { id: string; displayName: string }, id: string) {
  const appointment = await ownScheduled(tx, advisor.id, id);
  await tx.update(advisingAppointments).set({ status: "cancelled" }).where(eq(advisingAppointments.id, id));
  const members = await tx.select({ studentId: appointmentStudents.studentId }).from(appointmentStudents).where(eq(appointmentStudents.appointmentId, id));
  await notifyStudents(
    tx,
    members.map((member) => member.studentId),
    {
      kind: "advising",
      title: `Cố vấn đã hủy buổi hẹn: ${appointment.topic}`,
      body: `${advisor.displayName} hủy buổi hẹn lúc ${whenOf(appointment.date, appointment.startTime)}. Bạn không cần đến buổi này.`,
      href: STUDENT_APPOINTMENT_HREF,
    },
  );
}

export async function addAdvisingNote(tx: Transaction, advisorId: string, input: z.output<typeof ADVISING_NOTE_SCHEMA>) {
  const advisees = await adviseesAmong(tx, advisorId, [input.studentId]);
  if (!advisees.has(input.studentId)) throw new AdvisingError("Chỉ ghi chú được cho sinh viên thuộc lớp bạn cố vấn.", "studentId");
  const [row] = await tx.insert(advisingNotes).values({ ...input, authorId: advisorId }).returning({ id: advisingNotes.id });
  return row.id;
}
