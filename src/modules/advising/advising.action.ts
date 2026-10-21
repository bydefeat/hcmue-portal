"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/shared/libs/db.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { ADVISING_CONSTRAINT_MESSAGE } from "@/modules/advising/advising.constant";
import { addAdvisingNote, AdvisingError, cancelAppointmentFor, createAppointmentFor, recordAppointmentOutcome, rescheduleAppointment } from "@/modules/advising/advising.lib";
import { getAppointment, getMeetingNotesByIds } from "@/modules/advising/advising.query";
import {
  ADVISING_NOTE_SCHEMA,
  APPOINTMENT_OUTCOME_SCHEMA,
  APPOINTMENT_RESCHEDULE_SCHEMA,
  APPOINTMENT_SCHEMA,
  type AdvisingNoteInput,
  type AppointmentInput,
  type AppointmentOutcomeInput,
  type AppointmentRescheduleInput,
} from "@/modules/advising/advising.rule";
import type { Appointment, MeetingNote } from "@/modules/advising/advising.type";
import { getCurrentLecturer } from "@/modules/users/users.query";

function failure(error: unknown) {
  if (error instanceof AdvisingError) return actionError(error.message, error.field ? { [error.field]: error.message } : undefined);
  return actionFailure(error, ADVISING_CONSTRAINT_MESSAGE);
}

function revalidateAdvising() {
  revalidatePath("/lecturer/advising", "layout");
  revalidatePath("/lecturer");
  revalidatePath("/application/advising");
}

async function readBack(id: string): Promise<ActionResult<Appointment>> {
  revalidateAdvising();
  const appointment = await getAppointment(id);
  return appointment ? actionOk(appointment) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

export async function createAppointment(input: AppointmentInput): Promise<ActionResult<Appointment>> {
  const lecturer = await getCurrentLecturer();
  const parsed = parseInput(APPOINTMENT_SCHEMA, input);
  if (!parsed.ok) return parsed;
  let id: string;
  try {
    id = await db.transaction((tx) => createAppointmentFor(tx, lecturer, parsed.data));
  } catch (error) {
    return failure(error);
  }
  return readBack(id);
}

export async function recordAppointment(input: AppointmentOutcomeInput): Promise<ActionResult<{ appointment: Appointment; notes: MeetingNote[] }>> {
  const lecturer = await getCurrentLecturer();
  const parsed = parseInput(APPOINTMENT_OUTCOME_SCHEMA, input);
  if (!parsed.ok) return parsed;
  let noteIds: string[];
  try {
    noteIds = (await db.transaction((tx) => recordAppointmentOutcome(tx, lecturer.id, parsed.data))).noteIds;
  } catch (error) {
    return failure(error);
  }
  revalidateAdvising();
  const [appointment, notes] = await Promise.all([getAppointment(parsed.data.id), getMeetingNotesByIds(noteIds)]);
  return appointment ? actionOk({ appointment, notes }) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

export async function moveAppointment(input: AppointmentRescheduleInput): Promise<ActionResult<Appointment>> {
  const lecturer = await getCurrentLecturer();
  const parsed = parseInput(APPOINTMENT_RESCHEDULE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  try {
    await db.transaction((tx) => rescheduleAppointment(tx, lecturer, parsed.data));
  } catch (error) {
    return failure(error);
  }
  return readBack(parsed.data.id);
}

export async function cancelAppointment(id: string): Promise<ActionResult<Appointment>> {
  const lecturer = await getCurrentLecturer();
  if (!isUuid(id)) return actionError("Buổi hẹn không còn tồn tại, tải lại trang.");
  try {
    await db.transaction((tx) => cancelAppointmentFor(tx, lecturer, id));
  } catch (error) {
    return failure(error);
  }
  return readBack(id);
}

export async function createAdvisingNote(input: AdvisingNoteInput): Promise<ActionResult<MeetingNote>> {
  const lecturer = await getCurrentLecturer();
  const parsed = parseInput(ADVISING_NOTE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  let id: string;
  try {
    id = await db.transaction((tx) => addAdvisingNote(tx, lecturer.id, parsed.data));
  } catch (error) {
    return failure(error);
  }
  revalidateAdvising();
  const [note] = await getMeetingNotesByIds([id]);
  return note ? actionOk(note) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}
