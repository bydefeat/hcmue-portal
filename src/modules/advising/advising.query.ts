import { mockDelay } from "@/shared/libs/mock-request.lib";
import { APPOINTMENTS, MEETING_NOTES } from "./advising.mock";

export async function getAppointments(advisorId: string) {
  await mockDelay();
  return APPOINTMENTS.filter((appointment) => appointment.advisorId === advisorId);
}

export async function getMeetingNotes(studentIds: string[]) {
  await mockDelay();
  return MEETING_NOTES.filter((note) => studentIds.includes(note.studentId)).sort((a, b) => b.at.localeCompare(a.at));
}
