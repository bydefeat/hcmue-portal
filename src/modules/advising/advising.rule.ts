import { z } from "zod";
import type { Dayjs } from "dayjs";
import { dayjs, schoolTime } from "@/shared/libs/date.lib";

export const APPOINTMENT_SCHEMA = z.object({
  studentIds: z
    .array(z.uuid("Sinh viên không hợp lệ"))
    .min(1, "Chọn ít nhất một sinh viên")
    .max(60, "Tối đa 60 sinh viên một buổi hẹn")
    .transform((ids) => [...new Set(ids)]),
  topic: z.string().trim().min(1, "Chưa nhập nội dung").max(200, "Tối đa 200 ký tự"),
  date: z.iso.date("Chọn ngày").refine((value) => !dayjs(value).isBefore(dayjs().startOf("day")), "Không hẹn vào ngày đã qua"),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Chọn giờ"),
  durationMinutes: z.int("Chọn thời lượng").min(5, "Ít nhất 5 phút").max(240, "Tối đa 240 phút"),
  mode: z.enum(["in-person", "online"]),
  location: z.string().trim().min(1, "Chưa nhập địa điểm").max(200, "Tối đa 200 ký tự"),
});

export type AppointmentInput = z.input<typeof APPOINTMENT_SCHEMA>;

export const appointmentStart = (appointment: { date: string; startTime: string }) => schoolTime(`${appointment.date}T${appointment.startTime.slice(0, 5)}`);

const OPTIONAL_TEXT = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Tối đa ${max} ký tự`)
    .nullish()
    .transform((value) => value || null);

export const APPOINTMENT_OUTCOME_SCHEMA = z
  .object({
    id: z.uuid(),
    attendance: z.record(z.uuid(), z.enum(["present", "absent"], "Chọn có mặt hay vắng")),
    note: OPTIONAL_TEXT(1000),
    followUp: OPTIONAL_TEXT(300),
  })
  .refine((value) => !Object.values(value.attendance).includes("present") || value.note, { path: ["note"], message: "Ghi lại nội dung chính đã trao đổi" });

export type AppointmentOutcomeInput = z.input<typeof APPOINTMENT_OUTCOME_SCHEMA>;

export const APPOINTMENT_RESCHEDULE_SCHEMA = z.object({
  id: z.uuid(),
  date: APPOINTMENT_SCHEMA.shape.date,
  startTime: APPOINTMENT_SCHEMA.shape.startTime,
  durationMinutes: APPOINTMENT_SCHEMA.shape.durationMinutes,
  location: APPOINTMENT_SCHEMA.shape.location,
});

export type AppointmentRescheduleInput = z.input<typeof APPOINTMENT_RESCHEDULE_SCHEMA>;

export const ADVISING_NOTE_SCHEMA = z.object({
  studentId: z.uuid("Chọn sinh viên"),
  topic: z.string("Nhập chủ đề").trim().min(1, "Nhập chủ đề").max(200, "Tối đa 200 ký tự"),
  content: z.string("Nhập nội dung").trim().min(1, "Nhập nội dung").max(1000, "Tối đa 1000 ký tự"),
  followUp: OPTIONAL_TEXT(300),
});

export type AdvisingNoteInput = z.input<typeof ADVISING_NOTE_SCHEMA>;

export function outcomeStatus(attendance: Record<string, "present" | "absent">) {
  return Object.values(attendance).includes("present") ? ("done" as const) : ("missed" as const);
}

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export function appointmentsOverlap(a: { date: string; startTime: string; durationMinutes: number }, b: { date: string; startTime: string; durationMinutes: number }) {
  if (a.date !== b.date) return false;
  const aStart = minutesOf(a.startTime);
  const bStart = minutesOf(b.startTime);
  return aStart < bStart + b.durationMinutes && bStart < aStart + a.durationMinutes;
}

export function splitAppointments<T extends { date: string; startTime: string; durationMinutes: number; status: string }>(appointments: T[], now: Dayjs) {
  const endOf = (appointment: T) => dayjs(`${appointment.date}T${appointment.startTime}`).add(appointment.durationMinutes, "minute");
  const upcoming = appointments.filter((appointment) => appointment.status === "scheduled" && !endOf(appointment).isBefore(now));
  const past = appointments.filter((appointment) => !upcoming.includes(appointment));
  return {
    upcoming: upcoming.toSorted((a, b) => endOf(a).valueOf() - endOf(b).valueOf()),
    past: past.toSorted((a, b) => endOf(b).valueOf() - endOf(a).valueOf()),
  };
}
