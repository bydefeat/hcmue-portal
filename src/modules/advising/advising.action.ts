"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { formatDate } from "@/shared/libs/date.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { ADVISING_CONSTRAINT_MESSAGE, APPOINTMENT_MODE_LABEL } from "@/modules/advising/advising.constant";
import { getAppointment, getMeetingNotesByIds } from "@/modules/advising/advising.query";
import { APPOINTMENT_DONE_SCHEMA, APPOINTMENT_SCHEMA, type AppointmentDoneInput, type AppointmentInput } from "@/modules/advising/advising.rule";
import { advisingAppointments, advisingNotes, appointmentStudents } from "@/modules/advising/advising.schema";
import type { Appointment, AppointmentStatus, MeetingNote } from "@/modules/advising/advising.type";
import { notifyStudents } from "@/modules/notifications/notifications.lib";
import { getCurrentLecturer } from "@/modules/users/users.query";
import { administrativeClasses, students } from "@/modules/users/users.schema";

class AdvisingError extends Error {}

// Sinh viên đang được giảng viên này cố vấn (lớp sinh hoạt được phân công, chưa tốt nghiệp) trong danh sách cho trước.
async function adviseesAmong(tx: Transaction, lecturerId: string, studentIds: string[]) {
  if (studentIds.length === 0) return new Set<string>();
  const rows = await tx
    .select({ id: students.id })
    .from(students)
    .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .where(and(eq(administrativeClasses.advisorId, lecturerId), ne(students.status, "graduated"), inArray(students.id, studentIds)));
  return new Set(rows.map((row) => row.id));
}

// Thông báo vẫn ghi đủ giờ, nơi gặp để đọc ngay trong chuông; đường dẫn mở trang lịch hẹn của sinh viên.
const STUDENT_APPOINTMENT_HREF = "/application/advising";

const whenOf = (date: string, startTime: string) => `${startTime.slice(0, 5)} ngày ${formatDate(date)}`;

function revalidateAdvising() {
  revalidatePath("/lecturer/advising", "layout");
  revalidatePath("/lecturer");
  revalidatePath(STUDENT_APPOINTMENT_HREF);
}

export async function createAppointment(input: AppointmentInput): Promise<ActionResult<Appointment>> {
  const lecturer = await getCurrentLecturer();
  const parsed = parseInput(APPOINTMENT_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { studentIds, ...values } = parsed.data;
  let appointmentId: string;
  try {
    appointmentId = await db.transaction(async (tx) => {
      const advisees = await adviseesAmong(tx, lecturer.id, studentIds);
      if (studentIds.some((id) => !advisees.has(id))) throw new AdvisingError("Chỉ hẹn được sinh viên thuộc lớp bạn cố vấn. Tải lại trang để cập nhật danh sách.");
      const [row] = await tx
        .insert(advisingAppointments)
        .values({ ...values, advisorId: lecturer.id })
        .returning({ id: advisingAppointments.id });
      await tx.insert(appointmentStudents).values(studentIds.map((studentId) => ({ appointmentId: row.id, studentId })));
      await notifyStudents(tx, studentIds, {
        kind: "advising",
        title: `Cố vấn hẹn gặp: ${values.topic}`,
        body: `${lecturer.displayName} hẹn bạn lúc ${whenOf(values.date, values.startTime)}, ${values.durationMinutes} phút, ${APPOINTMENT_MODE_LABEL[values.mode].toLowerCase()} tại ${values.location}.`,
        href: STUDENT_APPOINTMENT_HREF,
      });
      return row.id;
    });
  } catch (error) {
    if (error instanceof AdvisingError) return actionError(error.message, { studentIds: error.message });
    return actionFailure(error, ADVISING_CONSTRAINT_MESSAGE);
  }
  revalidateAdvising();
  const appointment = await getAppointment(appointmentId);
  return appointment ? actionOk(appointment) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

// Chỉ đổi được buổi hẹn còn "đã hẹn" của chính mình; đã gặp, vắng, hủy là trạng thái cuối.
async function closeAppointment(tx: Transaction, lecturerId: string, id: string, status: Exclude<AppointmentStatus, "scheduled">, note: string | null) {
  const [row] = await tx
    .update(advisingAppointments)
    .set({ status, note })
    .where(and(eq(advisingAppointments.id, id), eq(advisingAppointments.advisorId, lecturerId), eq(advisingAppointments.status, "scheduled")))
    .returning({ id: advisingAppointments.id, topic: advisingAppointments.topic, date: advisingAppointments.date, startTime: advisingAppointments.startTime });
  if (!row) throw new AdvisingError("Buổi hẹn không còn ở trạng thái đã hẹn hoặc không phải của bạn. Tải lại trang.");
  return row;
}

export async function completeAppointment(input: AppointmentDoneInput): Promise<ActionResult<{ appointment: Appointment; notes: MeetingNote[] }>> {
  const lecturer = await getCurrentLecturer();
  const parsed = parseInput(APPOINTMENT_DONE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { id, note, followUp } = parsed.data;
  let noteIds: string[];
  try {
    noteIds = await db.transaction(async (tx) => {
      const appointment = await closeAppointment(tx, lecturer.id, id, "done", note);
      const members = await tx.select({ studentId: appointmentStudents.studentId }).from(appointmentStudents).where(eq(appointmentStudents.appointmentId, id));
      // Ghi chú vào hồ sơ cố vấn chỉ cho sinh viên còn thuộc lớp mình cố vấn.
      const advisees = await adviseesAmong(
        tx,
        lecturer.id,
        members.map((member) => member.studentId),
      );
      if (advisees.size === 0) return [];
      const rows = await tx
        .insert(advisingNotes)
        .values([...advisees].map((studentId) => ({ studentId, authorId: lecturer.id, topic: appointment.topic, content: note, followUp })))
        .returning({ id: advisingNotes.id });
      return rows.map((row) => row.id);
    });
  } catch (error) {
    if (error instanceof AdvisingError) return actionError(error.message);
    return actionFailure(error, ADVISING_CONSTRAINT_MESSAGE);
  }
  revalidateAdvising();
  const [appointment, notes] = await Promise.all([getAppointment(id), getMeetingNotesByIds(noteIds)]);
  return appointment ? actionOk({ appointment, notes }) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

async function closeWithoutNote(id: string, status: "missed" | "cancelled", note: string | null): Promise<ActionResult<Appointment>> {
  const lecturer = await getCurrentLecturer();
  if (!isUuid(id)) return actionError("Buổi hẹn không còn tồn tại, tải lại trang.");
  try {
    await db.transaction(async (tx) => {
      const appointment = await closeAppointment(tx, lecturer.id, id, status, note);
      // Hủy hẹn thì báo từng sinh viên được mời để không đến; đánh vắng là việc đã qua, không cần báo.
      if (status !== "cancelled") return;
      const members = await tx.select({ studentId: appointmentStudents.studentId }).from(appointmentStudents).where(eq(appointmentStudents.appointmentId, id));
      await notifyStudents(
        tx,
        members.map((member) => member.studentId),
        {
          kind: "advising",
          title: `Cố vấn đã hủy buổi hẹn: ${appointment.topic}`,
          body: `${lecturer.displayName} hủy buổi hẹn lúc ${whenOf(appointment.date, appointment.startTime)}. Bạn không cần đến buổi này.`,
          href: STUDENT_APPOINTMENT_HREF,
        },
      );
    });
  } catch (error) {
    if (error instanceof AdvisingError) return actionError(error.message);
    return actionFailure(error, ADVISING_CONSTRAINT_MESSAGE);
  }
  revalidateAdvising();
  const appointment = await getAppointment(id);
  return appointment ? actionOk(appointment) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

export async function markAppointmentMissed(id: string): Promise<ActionResult<Appointment>> {
  return closeWithoutNote(id, "missed", "Sinh viên không đến.");
}

export async function cancelAppointment(id: string): Promise<ActionResult<Appointment>> {
  return closeWithoutNote(id, "cancelled", null);
}
