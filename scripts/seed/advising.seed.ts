import type { Transaction } from "@/shared/libs/db.lib";
import { mockLecturerIdentity } from "@/shared/libs/mock.lib";
import { APPOINTMENTS, MEETING_NOTES } from "@/modules/advising/advising.mock";
import { advisingAppointments, advisingNotes, appointmentStudents } from "@/modules/advising/advising.schema";
import type { SeedContext } from "./context";

const NOTE_AUTHOR_ID = mockLecturerIdentity(0).id;

export async function seedAdvising(tx: Transaction, _context: SeedContext) {
  await tx.insert(advisingAppointments).values(APPOINTMENTS.map(({ students: _students, ...appointment }) => appointment));
  const members = APPOINTMENTS.flatMap((appointment) =>
    appointment.students.map((student) => ({
      appointmentId: appointment.id,
      studentId: student.id,
      attendance: student.attendance ?? (appointment.status === "done" ? ("present" as const) : appointment.status === "missed" ? ("absent" as const) : null),
    })),
  );
  await tx.insert(appointmentStudents).values(members);
  await tx.insert(advisingNotes).values(
    MEETING_NOTES.map((note) => ({
      id: note.id,
      studentId: note.studentId,
      appointmentId: note.appointmentId,
      authorId: NOTE_AUTHOR_ID,
      at: new Date(note.at),
      topic: note.topic,
      content: note.content,
      followUp: note.followUp,
    })),
  );
  return { appointments: APPOINTMENTS.length, members: members.length, notes: MEETING_NOTES.length };
}
